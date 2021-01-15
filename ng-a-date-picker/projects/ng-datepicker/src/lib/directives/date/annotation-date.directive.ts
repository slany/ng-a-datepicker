import { formatDate, ɵgetDOM as getDOM } from '@angular/common';
import { Directive, ElementRef, forwardRef, HostListener, Inject, Input, OnInit, Optional, Renderer2 } from '@angular/core';
import {
  AbstractControl,
  COMPOSITION_BUFFER_MODE,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { ApiModelValueConverter, DirectiveDateConfig, StandardModelValueConverters } from './date-configurator';
import { parseDate } from '../../parsers/parse-date';
import { DefaultDateModelValueConverter } from '../../converters/DefaultDateModelValueConverter';
import { DefaultIsoStringModelValueConverter } from '../../converters/DefaultIsoStringModelValueConverter';
import { DefaultNumberModelValueConverter } from '../../converters/DefaultNumberModelValueConverter';
import { DefaultFormattedModelValueConverter } from '../../converters/DefaultFormattedModelValueConverter';
import { NG_DATEPICKER_CONF } from '../../conf/ng-datepicker.conf.token';
import { NgDatepickerConf } from '../../conf/ng-datepicker.conf';

/**
 * We must check whether the agent is Android because composition events
 * behave differently between iOS and Android.
 */
function isAndroid(): boolean {
  const userAgent = getDOM() ? getDOM().getUserAgent() : '';
  return /android (\d+)/.test(userAgent.toLowerCase());
}

@Directive({
  selector: '[aNgDate]',
  // host: {
  //   '(input)': '$any(this)._handleInput($event.target.value)',
  //   '(blur)': '$any(this)._handleBlur()',
  //   '(compositionstart)': '$any(this)._compositionStart()',
  //   '(compositionend)': '$any(this)._compositionEnd($event.target.value)',
  // },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AnnotationDateDirective),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => AnnotationDateDirective),
      multi: true,
    },
  ],
})
export class AnnotationDateDirective implements ControlValueAccessor, Validator {
  private _composing = false;

  onChange: (value: any) => void; // Called on a value change
  onTouched: () => void; // Called if you care if the form was touched
  onValidatorChange: () => void; // Called on a validator change or re-validation;

  private config: DirectiveDateConfig = null;
  private hasConfig: boolean = false;

  dtValue: Date = null; // interna premenna
  _ngValue: any = null; // premenna ktoru posielame do ngModel

  get ngValue() {
    return this._ngValue;
  }

  set ngValue(v: any) {
    // ignore if null - user is typing
    if (v == null) return;

    this._ngValue = v;
    this.onChange(this._ngValue);
    this.onTouched();
  }

  constructor(
    private _renderer: Renderer2,
    private _elementRef: ElementRef,
    @Optional() @Inject(NG_DATEPICKER_CONF) private ngDatepickerConf: NgDatepickerConf,
    @Optional() @Inject(COMPOSITION_BUFFER_MODE) private _compositionMode: boolean
  ) {
    if (this._compositionMode == null) {
      this._compositionMode = !isAndroid();
    }
  }

  // registration for ControlValueAccessor
  registerOnChange(fn: (_: any) => void): void {
    this.onChange = fn;
  }

  // registration for ControlValueAccessor
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  // registration for Validator
  registerOnValidatorChange?(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  writeValue(value: any): void {
    this._renderer.setProperty(this._elementRef.nativeElement, 'value', this.valueFormatter(value));
  }

  setDisabledState(isDisabled: boolean): void {
    this._renderer.setProperty(this._elementRef.nativeElement, 'disabled', isDisabled);
  }

  // TODO - mfilo - 14.01.2021 -
  validate(control: AbstractControl): ValidationErrors | null {
    // console.log(control);
    // return { invalid: true };
    return null;
  }

  @HostListener('blur')
  _handleBlur() {
    this.onTouched();

    if (!this.dtValue) {
      // clean user input
      this.writeValue('');
      return;
    }

    const val = this.modelConverter.toModel(this.dtValue, null, this.config);
    this.writeValue(val);
  }

  @HostListener('input', ['$event.target.value'])
  _handleInput(value: any): void {
    if (!this._compositionMode || (this._compositionMode && !this._composing)) {
      this.onChange(this.valueParser(value));
    }
  }

  /** @internal */
  @HostListener('compositionstart')
  _compositionStart(): void {
    this._composing = true;
  }

  /** @internal */
  @HostListener('compositionend', ['$event.target.value'])
  _compositionEnd(value: any): void {
    this._composing = false;
    if (this._compositionMode) this.onChange(this.valueParser(value));
  }

  /// /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Customization behavior & config

  @Input('aNgDate')
  set setConfig(val: DirectiveDateConfig) {
    this.hasConfig = true;
    this.config = {} as DirectiveDateConfig;
    // set defaults from ModuleConf if exists
    if (this.ngDatepickerConf?.ngDateConf) {
      // TODO - mfilo - 15.01.2021 - @psl
      //  - pozri sem pls, keby spravim len `this.config=this.ngDatepickerConf.ngDateConf`
      //    tak zdielame jeden objekt pre vsetky komponenty co je blbost

      // we cant use JSON.parse(JSON.stringify()) to prevent reference to global config, because modelConverter can be a class instance
      this.config.popup = this.ngDatepickerConf.ngDateConf.popup;
      this.config.firstValueConverter = this.ngDatepickerConf.ngDateConf.firstValueConverter;
      this.config.modelConverter = this.ngDatepickerConf.ngDateConf.modelConverter;
      this.config.dateFormat = this.ngDatepickerConf.ngDateConf.dateFormat;
      this.config.displayFormat = this.ngDatepickerConf.ngDateConf.displayFormat;
      this.config.timezone = this.ngDatepickerConf.ngDateConf.timezone;
      this.config.locale = this.ngDatepickerConf.ngDateConf.locale;
    }

    // fill and overwrite ModuleConf values from direct input
    if (val?.popup) this.config.popup = val.popup;
    if (val?.firstValueConverter) this.config.firstValueConverter = val.firstValueConverter;
    if (val?.modelConverter) this.config.modelConverter = val.modelConverter;
    if (val?.dateFormat) this.config.dateFormat = val.dateFormat;
    if (val?.displayFormat) this.config.displayFormat = val.displayFormat;
    if (val?.timezone) this.config.timezone = val.timezone;
    if (val?.locale) this.config.locale = val.locale;

    // fill undefined/null values by defaults
    if (!this.config.popup) this.config.popup = true; // TODO - mfilo - 15.01.2021 - implement
    if (!this.config.modelConverter) this.config.modelConverter = 'string-iso-datetime-with-zone';
    if (!this.config.displayFormat) this.config.displayFormat = 'long';
    if (!this.config.timezone) this.config.timezone = undefined; // TODO - mfilo - 15.01.2021 - implement
    if (!this.config.locale) this.config.locale = 'en-US';
    // if (!this.config.firstValueConverter) this.config.firstValueConverter = undefined;
    // if (!this.config.dateFormat) this.config.dateFormat = undefined;

    console.log(this.config);
  }

  get modelConverter(): ApiModelValueConverter<any> {
    return this.handleConverterInput(this.config.modelConverter);
  }

  handleConverterInput(converter?: StandardModelValueConverters | ApiModelValueConverter<any>): ApiModelValueConverter<any> {
    return typeof converter === 'string' ? this.getConverter(converter) : converter;
  }

  getConverter(modelConverters: StandardModelValueConverters): ApiModelValueConverter<any> {
    switch (modelConverters) {
      case 'formatted':
        return DefaultFormattedModelValueConverter.INSTANCE;
      case 'date':
        return DefaultDateModelValueConverter.INSTANCE;
      case 'number-timestamp':
        return DefaultNumberModelValueConverter.INSTANCE;
      case 'string-iso-date':
        // TODO - mfilo - 14.01.2021 - format as const/static field
        this.config.dateFormat = 'YYYY-MM-dd';
        return DefaultFormattedModelValueConverter.INSTANCE;
      case 'string-iso-datetime':
        // TODO - mfilo - 14.01.2021 - format as const/static field
        this.config.dateFormat = 'YYYY-MM-ddTHH:mm';
        return DefaultFormattedModelValueConverter.INSTANCE;
      case 'string-iso-datetime-with-zone':
        return DefaultIsoStringModelValueConverter.INSTANCE;
      case 'string-iso-time':
        // TODO - mfilo - 14.01.2021 - format as const/static field
        this.config.dateFormat = 'HH:mm';
        return new DefaultFormattedModelValueConverter();
      case 'string-iso-time-with-zone':
        throw new Error('Converter not implemented error!');
      default:
        throw new Error('Unknown converter type!');
    }
  }

  /// /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Value formatter & parsers
  // ngModel = string(iso) | Date | number
  // html = formatter = 'yyyy-mm-dd'
  // value sender '2012-12-30'  => 30.12.2012  (po uprave) 31.12.2020 => Date => do modelu '2020-12-31'
  // <input type='a-date' ngmodel='value1' [aDate]='{format: 'dd. MM'}' />
  // <input type='a-date' ngmodel='value1' [aDate]='{format: 'hh:mm'}' />

  valueFormatter(value: any): string {
    if (value === undefined || value === null) return '';

    // first time - parse ANY input to Date
    if (!this.dtValue && !this.ngValue && this.config?.firstValueConverter) {
      const converter = this.handleConverterInput(this.config.firstValueConverter);
      this.dtValue = converter.fromModel(value);
      this.ngValue = this.modelConverter.toModel(this.dtValue, null, this.config);
      this.config.firstValueConverter = null;
    } else {
      this.ngValue = value;
      this.dtValue = this.modelConverter.fromModel(value, this.config);
    }

    if (this.dtValue == null) return '';
    return formatDate(this.dtValue, this.config.displayFormat, this.config.locale, this.config.timezone);
  }

  valueParser(val: string): string | number | Date {
    if (!val || !val.trim().length) {
      this.dtValue = null;
      this.ngValue = null;
      return this.ngValue;
    }

    this.dtValue = parseDate(val, this.config.displayFormat, this.config.locale, this.dtValue);

    if (!this.dtValue) {
      this.ngValue = null;
    } else {
      this.ngValue = this.modelConverter.toModel(this.dtValue, this.ngValue, this.config);
    }

    return this.ngValue;
  }
}
