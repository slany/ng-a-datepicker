import { Component, ElementRef, Input, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import {formatDate} from '@angular/common';
import { NgModel } from '@angular/forms';
import { BasicDateFormat, DateType } from '@annotation/ng-parse';
import { NgDateDirectiveApi } from '../../directives/ng-date/ng-date.directive.api';
import { NgDateConfigUtil } from '../../conf/ng-date.config.util';
import { HtmlValueConfig } from '../../model/ng-date-public.model';
import { ParseService } from '../../services/parse.service';
import {WeekDay} from "../../ng-datepicker.module";
import {getWeekStartByLocale} from 'weekstart';

@Component({
  selector: 'ng-date-popup',
  templateUrl: './popup.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class PopupComponent implements OnInit, OnDestroy {
  @Input()
  public ngDateDirective: NgDateDirectiveApi = null;

  @Input()
  public locale: string = undefined;

  @Input() public keepOpen: boolean = false;
  @Input() public timeStep: number = 1;

  @Input() public maxDate: Date;
  @Input() public minDate: Date;

  public position: 'top' | 'bottom' = 'bottom';
  public isOpen = false;
  public days: CalendarDay[];
  public localizedDays: string[];

  private firstDayOfWeek: WeekDay;

  private _val: Date;
  public realVal: Date;
  private _today: Date;

  set val(v: Date) {
    if (!v) {
      v = new Date();

      if (this.timeStep) {
        v.setMinutes(Math.round(v.getMinutes() / this.timeStep) * this.timeStep);
      }
    }

    const date = new Date(v.getTime());
    this._val = this.getClosestAllowedDate(date);
  }

  get val() {
    return this._val;
  }

  constructor(private _elementRef: ElementRef<HTMLElement>, private parse: ParseService) {
    const myDate = new Date();
    const timePortion = (myDate.getTime() - myDate.getTimezoneOffset() * 60 * 1000) % (3600 * 1000 * 24);
    this._today = new Date(+myDate - timePortion);
  }

  ngOnInit(): void {
    this.localizeComponent();
    this.ngDateDirective.addEventListenerToInput('pointerup', this.onInputTouch);
  }

  ngOnDestroy() {
    this.ngDateDirective.removeEventListenerFromInput('pointerup', this.onInputTouch);
  }

  /// ///////////////////////////////////
  // Component setup
  /// ///////////////////////////////////
  private localizeComponent() {
    const conf = NgDateConfigUtil.resolveHtmlValueConfig(this.ngDateDirective);

    // TODO - mfilo - 27.01.2021 - we should listen to locale change in case app has dynamic locale
    if (!this.locale) {
      // we can get locale 3 ways:
      //  1) user defined in input
      //  2) if provided to module, its injected into ngDateDirective and then read from it
      //  3) if ngDateDirective is undefined or locale does not exist we fallback to default locale 'en'
      this.locale = conf.locale;
    }

    // TODO - mfilo - 27.01.2021 - presunut na lepsie miesto (onInit) :)
    this.configureCalendarContent(conf);

    this.firstDayOfWeek = getWeekStartByLocale(this.locale); // 0 - Sunday, 1 - Monday, 2 - Tuesday, 3 - Wednesday, 4 - Thursday, 5 - Friday, 6 - Saturday

    this.localizedDays = JSON.parse(JSON.stringify(this.daysForLocale(this.locale)));

    const tmp = this.localizedDays.splice(0, this.firstDayOfWeek);
    this.localizedDays = this.localizedDays.concat(tmp);
  }

  daysForLocale(localeName = 'en-US') {
    const format = new Intl.DateTimeFormat(localeName, { weekday: 'short' });
    return Array.from({length: 7}, (_, i) => format.format(new Date(`2023-01-${i + 1}`)));
  }

  // TODO - mfilo - 27.01.2021 - WIP!!!
  config: {
    year: boolean;
    month: boolean;
    date: boolean;
    hours: 'off' | '12' | '24';
    minutes: boolean;
    // seconds: boolean;
    // ostatne podla CalendarContentType
  };

  private configureCalendarContent(conf: HtmlValueConfig) {
    const { types } = this.parse.getDateFormatParser(this.locale, conf.displayFormat as BasicDateFormat);

    if (!this.config) {
      // TODO - mfilo - 27.01.2021 - typings!!!
      this.config = {} as any;
    }

    this.config.year = types.includes(DateType.FullYear);
    this.config.month = types.includes(DateType.Month);
    this.config.date = types.includes(DateType.Date);
    this.config.hours = types.includes(DateType.Hours_24) ? '24' : 'off';
    this.config.minutes = types.includes(DateType.Minutes);
  }

  private readDays() {
    // replaced by `getClosestAllowedDate`
    // if (this.maxDate && +this.val > +this.maxDate) {
    //   this.val = this.maxDate;
    // } else if (this.minDate && +this.val < +this.minDate) {
    //   this.val = this.minDate;
    // }

    this.days = utils.createCalendar(this.val.getFullYear(), this.val.getMonth(), this.firstDayOfWeek);
  }

  /// ///////////////////////////////////
  // Handle input[ngDate] interaction
  /// ///////////////////////////////////
  private onInputTouch = () => {
    document.removeEventListener('pointerdown', this.onFocusOut);

    this.realVal = this.getClosestAllowedDate(this.ngDateDirective.readValue().dtValue);
    this.val = this.realVal;

    this.readDays();
    this.isOpen = true;

    this.position = (<unknown>'bottom-hidden') as any; // reset position
    setTimeout(() => {
      // wait for render
      this.position = utils.getPosition(this._elementRef.nativeElement, this.ngDateDirective.getInputHeight());
    });

    document.addEventListener('pointerdown', this.onFocusOut);
  };

  private getClosestAllowedDate = (date: Date) => {
    if (typeof date?.getDate !== 'function') return null;

    if (this.isOutOfBounds(date)) {
      if (this.isLowerThanMinDate(date)) {
        return new Date(this.minDate.getTime());
      }

      return new Date(this.maxDate.getTime());
    }

    return new Date(date.getTime());
  };

  private onFocusOut = (e: Event) => {
    const inPopup = e.composedPath().some((element) => (element as HTMLElement).classList?.contains('ng-date-popup'));
    if (inPopup) {
      return;
    }

    document.removeEventListener('pointerdown', this.onFocusOut);
    this.isOpen = false;
    this.ngDateDirective.onTouched();
  };

  /// ///////////////////////////////////
  // Handle user interaction with popup
  /// ///////////////////////////////////
  setYear($event: number) {
    this.val.setDate(1);
    this.val.setFullYear($event);

    // date pipe is 'pure'
    this.val = this.getClosestAllowedDate(this.val);

    this.readDays();
  }

  setDate($event: Date) {
    $event.setHours(this.val.getHours());
    $event.setMinutes(this.val.getMinutes());
    $event.setSeconds(this.val.getSeconds());
    $event.setMilliseconds(this.val.getMilliseconds());

    this.val = new Date($event.getTime());
    this.val.setFullYear($event.getFullYear());

    this.ngDateDirective.changeValue(this.val);

    this.realVal = this.ngDateDirective.readValue().dtValue;
    this.val = this.realVal;

    if (!this.keepOpen && !(this.config.minutes || this.config.hours !== 'off')) {
      this.isOpen = false;
    }

    this.readDays();
  }

  addMonth() {
    this.val.setDate(1);
    this.val.setMonth(this.val.getMonth() + 1);

    // date pipe is 'pure'
    this.val = this.getClosestAllowedDate(this.val);

    this.readDays();
  }

  removeMonth() {
    this.val.setDate(1);
    this.val.setMonth(this.val.getMonth() - 1);

    // date pipe is 'pure'
    this.val = this.getClosestAllowedDate(this.val);

    this.readDays();
  }

  setHours($event: any, ngModelHour: NgModel) {
    if (this.minDate || this.maxDate) {
      const tmp = new Date(this.val);
      tmp.setHours($event);

      if (this.isOutOfBounds(tmp)) {
        const v = formatDate(this.val, 'HH', this.locale);
        ngModelHour.reset(v);
        return;
      }
    }

    this.val.setHours($event);
    this.ngDateDirective.changeValue(this.val);
    this.readDays();
  }

  setMinutes($event: any, ngModelMinute: NgModel) {
    if ($event % this.timeStep !== 0) {
      $event = Math.round(parseInt($event, 10) / this.timeStep) * this.timeStep;
    }

    if (this.minDate || this.maxDate) {
      const tmp = new Date(this.val);
      tmp.setMinutes($event);

      if (this.isOutOfBounds(tmp)) {
        const v = formatDate(this.val, 'mm', this.locale);
        ngModelMinute.reset(v);
        return;
      }
    }

    this.val.setMinutes($event);
    this.ngDateDirective.changeValue(this.val);
    this.readDays();
  }

  compareDate(date: Date): boolean {
    if (!this.realVal) {
      return this._today.toLocaleDateString() === date.toLocaleDateString();
    }

    return this.realVal.toLocaleDateString() === date.toLocaleDateString();
  }

  isOutOfBounds(date: Date) {
    return this.isLowerThanMinDate(date) || this.isHigherThanMaxDate(date);
  }

  isHigherThanMaxDate(date: Date) {
    return this.maxDate && +date > +this.maxDate;
  }

  isLowerThanMinDate(date: Date) {
    return this.minDate && +date < +this.minDate;
  }

  wouldBeOutOfBounds(isAdd: boolean) {
    const tmp = new Date(this.val);

    if (!isAdd) {
      tmp.setDate(0);
    } else {
      tmp.setDate(1);
      tmp.setMonth(tmp.getMonth() + 1);
    }

    return this.isOutOfBounds(tmp);
  }
}

const utils = {
  getPosition: (popup: HTMLElement, inputHeight: any): 'top' | 'bottom' => {
    if (!popup) return 'bottom';

    const ngDatePopup: HTMLElement = popup.querySelector('.ng-date-popup');

    if (!ngDatePopup) return 'bottom';

    // src: https://github.com/ng-select/ng-select/commit/d4404f7
    const selectRect = ngDatePopup.getBoundingClientRect();
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const offsetTop = selectRect.top + window.pageYOffset;
    const dropdownHeight = selectRect.height;

    if (offsetTop + dropdownHeight > scrollTop + document.documentElement.clientHeight) {
      const SPACE_BETWEEN_ELEMENTS = 5; // px
      ngDatePopup.style.transform = `translateY(-${inputHeight + SPACE_BETWEEN_ELEMENTS}px)`;
      return 'top';
    }

    return 'bottom';
  },

  // months are 0 based!!! (january = 0)
  createCalendar: (year: number, month: number, firstDayOfWeek: WeekDay) => {
    const days: CalendarDay[] = [];

    const currMonthDays = new Date(year, month + 1, 0).getDate();

    // if firstDayOfMonth is first day of week, show previous week (same for lastDayOfMonth
    const firstDayOfMonth = utils.getDayOfWeek(new Date(year, month, 1), firstDayOfWeek) || 7;
    const lastDayOfMonth = 6 - utils.getDayOfWeek(new Date(year, month, currMonthDays), firstDayOfWeek) || 7;

    const nextYearNumber = month === 11 ? year + 1 : year;
    const nextMonthNumber = (month + 1 + 12) % 12;

    const prevYearNumber = month === 0 ? year - 1 : year;
    const prevMonthNumber = (month - 1 + 12) % 12;
    const prevMonthDays = new Date(year, prevMonthNumber + 1, 0).getDate();

    const prevMonthStart = prevMonthDays - firstDayOfMonth;
    for (let i = 1; i <= firstDayOfMonth; i++) {
      const day = prevMonthStart + i;
      const date = new Date(prevYearNumber, prevMonthNumber, day);
      const dayOfWeek = utils.getDayOfWeek(date, firstDayOfWeek);
      days.push({ day, currentMonth: false, date, dayOfWeek });
    }

    for (let j = 1; j <= currMonthDays; j++) {
      const date = new Date(year, month, j);
      const dayOfWeek = utils.getDayOfWeek(date, firstDayOfWeek);
      days.push({ day: j, currentMonth: true, date, dayOfWeek });
    }

    for (let k = 1; k <= lastDayOfMonth; k++) {
      const date = new Date(nextYearNumber, nextMonthNumber, k);
      const dayOfWeek = utils.getDayOfWeek(date, firstDayOfWeek);
      days.push({ day: k, currentMonth: false, date, dayOfWeek });
    }

    return days;
  },

  getDayOfWeek: (date: Date, firstDayOfWeek: WeekDay): number => {
    return (date.getDay() - firstDayOfWeek + 7) % 7;
  },
};

interface CalendarDay {
  day: number;
  dayOfWeek: number;
  date: Date;
  currentMonth: boolean;
}

// TODO - mfilo - 31.01.2021 - implement
type CalendarContentType =
  | 'year-picker' // yyyy -> 2012
  | 'month-picker' // MM, yyyy -> Dec, 2012
  | 'standalone-month-picker' // LLLL -> December
  | 'date-picker' // d.M.yyyy -> 1.12.2012
  | 'date-time-picker' // dd.MM.yyyy, H:mm -> 1.12.2012, 4:18
  | 'time-picker' // H:mm -> 4:18
  | 'day-picker'; // EEEE -> Tuesday
