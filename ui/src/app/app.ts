import { AsyncPipe, DatePipe, KeyValuePipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, viewChild, inject, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription, map, distinctUntilChanged, finalize } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';  
import { faTrashAlt, faCheckCircle, faTimesCircle, faRedoAlt, faSun, faMoon, faCheck, faCircleHalfStroke, faDownload, faExternalLinkAlt, faFileImport, faFileExport, faCopy, faClock, faTachometerAlt, faSortAmountDown, faSortAmountUp, faChevronRight, faChevronDown, faUpload, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { CookieService } from 'ngx-cookie-service';
import { AddDownloadPayload, DownloadsService, ProxyConfig } from './services/downloads.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { MeTubeSocket } from './services/metube-socket.service';
import { SubscriptionRow } from './interfaces/subscription';
import { Themes } from './theme';
import {
  Download,
  Status,
  Theme,
  Quality,
  Option,
  AudioFormatOption,
  DOWNLOAD_TYPES,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  VIDEO_QUALITIES,
  AUDIO_FORMATS,
  CAPTION_FORMATS,
  THUMBNAIL_FORMATS,
  State,
} from './interfaces';
import { EtaPipe, SpeedPipe, FileSizePipe } from './pipes';
import { SelectAllCheckboxComponent, ItemCheckboxComponent } from './components/';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
        FormsModule,
        NgTemplateOutlet,
        KeyValuePipe,
        AsyncPipe,
        DatePipe,
        FontAwesomeModule,
        NgbModule,
        NgSelectModule,
        EtaPipe,
        SpeedPipe,
        FileSizePipe,
        SelectAllCheckboxComponent,
        ItemCheckboxComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.sass',
})
export class App implements AfterViewInit, OnInit, OnDestroy {
  downloads = inject(DownloadsService);
  subscriptionsSvc = inject(SubscriptionsService);
  private cookieService = inject(CookieService);
  private http = inject(HttpClient);
  private socket = inject(MeTubeSocket);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  addUrl!: string;
  downloadTypes: Option[] = DOWNLOAD_TYPES;
  videoCodecs: Option[] = VIDEO_CODECS;
  videoFormats: Option[] = VIDEO_FORMATS;
  audioFormats: AudioFormatOption[] = AUDIO_FORMATS;
  captionFormats: Option[] = CAPTION_FORMATS;
  thumbnailFormats: Option[] = THUMBNAIL_FORMATS;
  formatOptions: Option[] = [];
  qualities!: Quality[];
  downloadType: string;
  codec: string;
  quality: string;
  format: string;
  folder!: string;
  customNamePrefix!: string;
  autoStart: boolean;
  playlistItemLimit!: number;
  splitByChapters: boolean;
  chapterTemplate: string;
  subtitleLanguage: string;
  subtitleMode: string;
  ytdlOptionsPresets: string[] = [];
  ytdlOptionsOverrides: string;
  ytdlOptionPresetNames: string[] = [];
  addInProgress = false;
  cancelRequested = false;
  subscribeInProgress = false;
  checkIntervalMinutes = 60;
  cachedSubs: [string, SubscriptionRow][] = [];
  selectedSubscriptionIds = new Set<string>();
  checkingSubscriptionIds = new Set<string>();
  checkingAllSubscriptions = false;
  checkingSelectedSubscriptions = false;
  hasCookies = false;
  cookieUploadInProgress = false;
  authEnabled = false;
  authChecked = false;
  isAuthenticated = false;
  authUsernameInput = '';
  authPasswordInput = '';
  authError = '';
  authLoading = false;
  proxyEnabled = false;
  proxyScheme: 'socks5' | 'http' | 'https' = 'socks5';
  proxyHost = '';
  proxyPort = 1080;
  proxyUsername = '';
  proxyPassword = '';
  proxyHasPassword = false;
  proxySaving = false;
  private appInitialized = false;
  themes: Theme[] = Themes;
  activeTheme: Theme | undefined;
  customDirs$!: Observable<string[]>;
  showBatchPanel = false; 
  batchImportModalOpen = false;
  batchImportText = '';
  batchImportStatus = '';
  importInProgress = false;
  cancelImportFlag = false;
  ytDlpOptionsUpdateTime: string | null = null;
  ytDlpVersion: string | null = null;
  metubeVersion: string | null = null;
  isAdvancedOpen = false;
  sortAscending = false;
  expandedErrors: Set<string> = new Set<string>();
  cachedSortedDone: [string, Download][] = [];
  lastCopiedErrorId: string | null = null;
  private previousDownloadType = 'video';
  private addRequestSub?: Subscription;
  private selectionsByType: Record<string, {
    codec: string;
    format: string;
    quality: string;
    subtitleLanguage: string;
    subtitleMode: string;
  }> = {};
  private readonly selectionCookiePrefix = 'metube_selection_';
  private readonly settingsCookieExpiryDays = 3650;
  private lastFocusedElement: HTMLElement | null = null;
  private colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private onColorSchemeChanged = () => {
    if (this.activeTheme && this.activeTheme.id === 'auto') {
      this.setTheme(this.activeTheme);
    }
  };

  // Download metrics
  activeDownloads = 0;
  queuedDownloads = 0;
  completedDownloads = 0;
  failedDownloads = 0;
  totalSpeed = 0;
  hasCompletedDone = false;
  hasFailedDone = false;

  readonly queueMasterCheckbox = viewChild<SelectAllCheckboxComponent>('queueMasterCheckboxRef');
  readonly queueDelSelected = viewChild.required<ElementRef>('queueDelSelected');
  readonly queueDownloadSelected = viewChild.required<ElementRef>('queueDownloadSelected');
  readonly doneMasterCheckbox = viewChild<SelectAllCheckboxComponent>('doneMasterCheckboxRef');
  readonly doneDelSelected = viewChild.required<ElementRef>('doneDelSelected');
  readonly doneDownloadSelected = viewChild.required<ElementRef>('doneDownloadSelected');

  faTrashAlt = faTrashAlt;
  faCheckCircle = faCheckCircle;
  faTimesCircle = faTimesCircle;
  faRedoAlt = faRedoAlt;
  faSun = faSun;
  faMoon = faMoon;
  faCheck = faCheck;
  faCircleHalfStroke = faCircleHalfStroke;
  faDownload = faDownload;
  faExternalLinkAlt = faExternalLinkAlt;
  faFileImport = faFileImport;
  faFileExport = faFileExport;
  faCopy = faCopy;
  faGithub = faGithub;
  faClock = faClock;
  faTachometerAlt = faTachometerAlt;
  faSortAmountDown = faSortAmountDown;
  faSortAmountUp = faSortAmountUp;
  faChevronRight = faChevronRight;
  faChevronDown = faChevronDown;
  faUpload = faUpload;
  faPause = faPause;
  faPlay = faPlay;
  subtitleLanguages = [
    { id: 'en', text: 'Английский' },
    { id: 'ar', text: 'Арабский' },
    { id: 'bn', text: 'Бенгальский' },
    { id: 'bg', text: 'Болгарский' },
    { id: 'ca', text: 'Каталанский' },
    { id: 'cs', text: 'Чешский' },
    { id: 'da', text: 'Датский' },
    { id: 'nl', text: 'Нидерландский' },
    { id: 'es', text: 'Испанский' },
    { id: 'et', text: 'Эстонский' },
    { id: 'fi', text: 'Финский' },
    { id: 'fr', text: 'Французский' },
    { id: 'de', text: 'Немецкий' },
    { id: 'el', text: 'Греческий' },
    { id: 'he', text: 'Иврит' },
    { id: 'hi', text: 'Хинди' },
    { id: 'hu', text: 'Венгерский' },
    { id: 'id', text: 'Индонезийский' },
    { id: 'it', text: 'Итальянский' },
    { id: 'lt', text: 'Литовский' },
    { id: 'lv', text: 'Латышский' },
    { id: 'ms', text: 'Малайский' },
    { id: 'no', text: 'Норвежский' },
    { id: 'pl', text: 'Польский' },
    { id: 'pt', text: 'Португальский' },
    { id: 'pt-BR', text: 'Португальский (Бразилия)' },
    { id: 'ro', text: 'Румынский' },
    { id: 'ru', text: 'Русский' },
    { id: 'sk', text: 'Словацкий' },
    { id: 'sl', text: 'Словенский' },
    { id: 'sr', text: 'Сербский' },
    { id: 'sv', text: 'Шведский' },
    { id: 'ta', text: 'Тамильский' },
    { id: 'te', text: 'Телугу' },
    { id: 'th', text: 'Тайский' },
    { id: 'tr', text: 'Турецкий' },
    { id: 'uk', text: 'Украинский' },
    { id: 'ur', text: 'Урду' },
    { id: 'vi', text: 'Вьетнамский' },
    { id: 'ja', text: 'Японский' },
    { id: 'ko', text: 'Корейский' },
    { id: 'zh-Hans', text: 'Китайский (упрощенный)' },
    { id: 'zh-Hant', text: 'Китайский (традиционный)' },
  ];
  subtitleModes = [
    { id: 'prefer_manual', text: 'Предпочитать ручные' },
    { id: 'prefer_auto', text: 'Предпочитать авто' },
    { id: 'manual_only', text: 'Только ручные' },
    { id: 'auto_only', text: 'Только авто' },
  ];
  constructor() {
    this.downloadType = this.cookieService.get('metube_download_type') || 'video';
    this.codec = this.cookieService.get('metube_codec') || 'auto';
    this.format = this.cookieService.get('metube_format') || 'any';
    this.quality = this.cookieService.get('metube_quality') || 'best';
    this.autoStart = this.cookieService.get('metube_auto_start') !== 'false';
    this.splitByChapters = this.cookieService.get('metube_split_chapters') === 'true';
    // Will be set from backend configuration, use empty string as placeholder
    this.chapterTemplate = this.cookieService.get('metube_chapter_template') || '';
    this.subtitleLanguage = this.cookieService.get('metube_subtitle_language') || 'en';
    this.subtitleMode = this.cookieService.get('metube_subtitle_mode') || 'prefer_manual';
    this.ytdlOptionsPresets = this.loadYtdlOptionsPresetsFromCookie();
    this.ytdlOptionsOverrides = this.cookieService.get('metube_ytdl_options_overrides') || '';
    const allowedDownloadTypes = new Set(this.downloadTypes.map(t => t.id));
    const allowedVideoCodecs = new Set(this.videoCodecs.map(c => c.id));
    if (!allowedDownloadTypes.has(this.downloadType)) {
      this.downloadType = 'video';
    }
    if (!allowedVideoCodecs.has(this.codec)) {
      this.codec = 'auto';
    }
    const allowedSubtitleModes = new Set(this.subtitleModes.map(mode => mode.id));
    if (!allowedSubtitleModes.has(this.subtitleMode)) {
      this.subtitleMode = 'prefer_manual';
    }
    this.loadSavedSelections();
    this.restoreSelection(this.downloadType);
    this.normalizeSelectionsForType();
    this.setQualities();
    this.refreshFormatOptions();
    this.previousDownloadType = this.downloadType;
    this.saveSelection(this.downloadType);
    this.sortAscending = this.cookieService.get('metube_sort_ascending') === 'true';

    const ci = parseInt(this.cookieService.get('metube_check_interval') || '', 10);
    if (!Number.isNaN(ci) && ci >= 1) {
      this.checkIntervalMinutes = ci;
    }
    this.activeTheme = this.getPreferredTheme(this.cookieService);

    // Subscribe to download updates
    this.downloads.queueChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateMetrics();
      this.cdr.markForCheck();
    });
    this.downloads.doneChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateMetrics();
      this.rebuildSortedDone();
      this.cdr.markForCheck();
    });
    // Subscribe to real-time updates
    this.downloads.updated.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateMetrics();
      this.cdr.markForCheck();
    });

    this.subscriptionsSvc.subscriptionsChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.rebuildCachedSubs();
      this.cdr.markForCheck();
    });
  }

  ngOnInit() {
    this.checkAuthStatus();
    this.colorSchemeMediaQuery.addEventListener('change', this.onColorSchemeChanged);
  }

  ngAfterViewInit() {
    this.downloads.queueChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.queueMasterCheckbox()?.selectionChanged();
      this.cdr.markForCheck();
    });
    this.downloads.doneChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.doneMasterCheckbox()?.selectionChanged();
      this.updateDoneActionButtons();
      this.cdr.markForCheck();
    });
    // Initialize action button states for already-loaded entries.
    this.updateDoneActionButtons();
    this.fetchVersionInfo();
  }

  ngOnDestroy() {
    this.addRequestSub?.unsubscribe();
    this.colorSchemeMediaQuery.removeEventListener('change', this.onColorSchemeChanged);
  }

  private initializeAppData() {
    if (this.appInitialized) return;
    this.appInitialized = true;
    this.downloads.getCookieStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.hasCookies = !!(data && typeof data === 'object' && 'has_cookies' in data && data.has_cookies);
      this.cdr.markForCheck();
    });
    this.getConfiguration();
    this.getYtdlOptionsUpdateTime();
    this.getYtdlOptionPresets();
    this.customDirs$ = this.getMatchingCustomDir();
    this.loadProxyConfig();
    this.setTheme(this.activeTheme!);
  }

  checkAuthStatus() {
    this.http.get<{ auth_enabled: boolean; authenticated: boolean }>('auth/status')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.authEnabled = !!res?.auth_enabled;
          this.isAuthenticated = !this.authEnabled || !!res?.authenticated;
          this.authChecked = true;
          if (this.isAuthenticated) {
            this.initializeAppData();
            this.socket.connect();
          } else {
            this.socket.disconnect();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.authEnabled = false;
          this.isAuthenticated = true;
          this.authChecked = true;
          this.initializeAppData();
          this.socket.connect();
          this.cdr.markForCheck();
        },
      });
  }

  login() {
    if (this.authLoading) return;
    this.authError = '';
    if (!this.authUsernameInput.trim() || !this.authPasswordInput) {
      this.authError = 'Введите логин и пароль';
      return;
    }
    this.authLoading = true;
    this.http.post<{ status?: string; msg?: string }>('auth/login', {
      username: this.authUsernameInput.trim(),
      password: this.authPasswordInput,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.authLoading = false;
          if (res?.status === 'error') {
            this.authError = res.msg || 'Неверный логин или пароль';
            this.cdr.markForCheck();
            return;
          }
          this.isAuthenticated = true;
          this.authChecked = true;
          this.authPasswordInput = '';
          this.initializeAppData();
          this.socket.connect();
          this.cdr.markForCheck();
        },
        error: () => {
          this.authLoading = false;
          this.authError = 'Не удалось выполнить вход';
          this.cdr.markForCheck();
        },
      });
  }

  logout() {
    this.http.post('auth/logout', {}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isAuthenticated = false;
        this.authPasswordInput = '';
        this.authError = '';
        this.socket.disconnect();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isAuthenticated = false;
        this.socket.disconnect();
        this.cdr.markForCheck();
      },
    });
  }

  loadProxyConfig() {
    this.downloads.getProxyConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const data = (res as { proxy?: ProxyConfig })?.proxy;
        if (!data) return;
        this.proxyEnabled = !!data.enabled;
        this.proxyScheme = (data.scheme || 'socks5') as 'socks5' | 'http' | 'https';
        this.proxyHost = data.host || '';
        this.proxyPort = data.port || 1080;
        this.proxyUsername = data.username || '';
        this.proxyHasPassword = !!data.has_password;
        this.proxyPassword = '';
        this.cdr.markForCheck();
      },
    });
  }

  saveProxyConfig() {
    if (this.proxyEnabled) {
      if (!this.proxyHost.trim()) {
        alert('Укажите адрес прокси-сервера');
        return;
      }
      if (!this.proxyPort || this.proxyPort < 1 || this.proxyPort > 65535) {
        alert('Укажите корректный порт прокси (1-65535)');
        return;
      }
    }
    this.proxySaving = true;
    const payload: ProxyConfig = {
      enabled: this.proxyEnabled,
      scheme: this.proxyScheme,
      host: this.proxyHost.trim(),
      port: this.proxyPort,
      username: this.proxyUsername.trim(),
      password: this.proxyPassword,
    };
    this.downloads.saveProxyConfig(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.proxySaving = false;
        const data = (res as { proxy?: ProxyConfig })?.proxy;
        if (data) {
          this.proxyHasPassword = !!data.has_password || !!this.proxyPassword;
          this.proxyPassword = '';
        }
        alert('Глобальный прокси сохранен');
        this.cdr.markForCheck();
      },
      error: () => {
        this.proxySaving = false;
        alert('Не удалось сохранить настройки прокси');
        this.cdr.markForCheck();
      },
    });
  }

  // workaround to allow fetching of Map values in the order they were inserted
  //  https://github.com/angular/angular/issues/31420
    
   
      
  asIsOrder() {
    return 1;
  }

  qualityChanged() {
    this.cookieService.set('metube_quality', this.quality, { expires: this.settingsCookieExpiryDays });
    this.saveSelection(this.downloadType);
    // Re-trigger custom directory change
    this.downloads.customDirsChanged.next(this.downloads.customDirs);
  }

  downloadTypeChanged() {
    this.saveSelection(this.previousDownloadType);
    this.restoreSelection(this.downloadType);
    this.cookieService.set('metube_download_type', this.downloadType, { expires: this.settingsCookieExpiryDays });
    this.normalizeSelectionsForType(false);
    this.setQualities();
    this.refreshFormatOptions();
    this.saveSelection(this.downloadType);
    this.previousDownloadType = this.downloadType;
    this.downloads.customDirsChanged.next(this.downloads.customDirs);
  }

  codecChanged() {
    this.cookieService.set('metube_codec', this.codec, { expires: this.settingsCookieExpiryDays });
    this.saveSelection(this.downloadType);
  }

  showAdvanced() {
    return this.downloads.configuration['CUSTOM_DIRS'];
  }

  allowYtdlOptionsOverrides() {
    return this.downloads.configuration['ALLOW_YTDL_OPTIONS_OVERRIDES'] === true;
  }

  allowCustomDir(tag: string) {
    if (this.downloads.configuration['CREATE_CUSTOM_DIRS']) {
      return tag;
    }
    return false;
  }

  isAudioType() {
    return this.downloadType === 'audio';
  }

  getMatchingCustomDir() : Observable<string[]> {
    return this.downloads.customDirsChanged.asObservable().pipe(
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map((output: any) => {
        // Keep logic consistent with app/ytdl.py
        if (this.isAudioType()) {
          console.debug("Showing audio-specific download directories");
          return output["audio_download_dir"];
        } else {
          console.debug("Showing default download directories");
          return output["download_dir"];
        }
      }),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    );
  }

  getYtdlOptionsUpdateTime() {
    this.downloads.ytdlOptionsChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (data:any) => {
        if (data['success']){
          const date = new Date(data['update_time'] * 1000);
          this.ytDlpOptionsUpdateTime=date.toLocaleString();
        }else{
          alert("Ошибка перезагрузки настроек yt-dlp: " + data['msg']);
        }
        this.cdr.markForCheck();
      }
    });
  }
  getConfiguration() {
    this.downloads.configurationChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (config: any) => {
        const playlistItemLimit = config['DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT'];
        if (playlistItemLimit !== '0') {
          this.playlistItemLimit = playlistItemLimit;
        }
        // Set chapter template from backend config if not already set by cookie
        if (!this.chapterTemplate) {
          this.chapterTemplate = config['OUTPUT_TEMPLATE_CHAPTER'];
        }
        if (!this.cookieService.check('metube_check_interval')) {
          const dci = parseInt(String(config['SUBSCRIPTION_DEFAULT_CHECK_INTERVAL'] ?? 60), 10);
          if (!Number.isNaN(dci) && dci >= 1) {
            this.checkIntervalMinutes = dci;
          }
        }
        this.cdr.markForCheck();
      }
    });
  }

  getYtdlOptionPresets() {
    this.downloads.getPresets().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.ytdlOptionPresetNames = Array.isArray(data?.presets)
          ? data.presets.filter((preset): preset is string => typeof preset === 'string')
          : [];
        if (this.ytdlOptionsPresets?.length) {
          const valid = new Set(this.ytdlOptionPresetNames);
          const filtered = this.ytdlOptionsPresets.filter((p) => valid.has(p));
          if (filtered.length !== this.ytdlOptionsPresets.length) {
            this.ytdlOptionsPresets = filtered;
            this.ytdlOptionsPresetsChanged();
          }
        }
        this.cdr.markForCheck();
      },
    });
  }

  private loadYtdlOptionsPresetsFromCookie(): string[] {
    const jsonCookie = this.cookieService.get('metube_ytdl_options_presets');
    if (jsonCookie) {
      try {
        const parsed = JSON.parse(jsonCookie) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
        }
      } catch {
        // fall through to legacy cookie
      }
    }
    const legacy = this.cookieService.get('metube_ytdl_options_preset')?.trim();
    return legacy ? [legacy] : [];
  }

  private validateYtdlOptionsOverrides(value: string): boolean {
    if (!this.allowYtdlOptionsOverrides()) {
      return true;
    }
    const trimmed = value?.trim() || '';
    if (!trimmed) {
      return true;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        alert('Пользовательские параметры yt-dlp должны быть JSON-объектом');
        return false;
      }
    } catch {
      alert('Пользовательские параметры yt-dlp должны быть валидным JSON');
      return false;
    }
    return true;
  }

  private rebuildCachedSubs() {
    this.cachedSubs = Array.from(this.subscriptionsSvc.subscriptions.entries());
    const validIds = new Set(this.cachedSubs.map(([id]) => id));
    for (const id of [...this.selectedSubscriptionIds]) {
      if (!validIds.has(id)) {
        this.selectedSubscriptionIds.delete(id);
      }
    }
  }

  checkIntervalChanged() {
    this.cookieService.set('metube_check_interval', String(this.checkIntervalMinutes), {
      expires: this.settingsCookieExpiryDays,
    });
  }

  private getStatusError(res: unknown): string | null {
    const status = res as { status?: string; msg?: string };
    return status?.status === 'error' ? status.msg || null : null;
  }

  private refreshSubscriptionsWithAlert() {
    this.subscriptionsSvc.refreshList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((refreshRes) => {
      const error = this.getStatusError(refreshRes);
      if (error) {
        alert(error || 'Не удалось обновить подписки');
        return;
      }
      this.cdr.markForCheck();
    });
  }

  isSubSelected(id: string): boolean {
    return this.selectedSubscriptionIds.has(id);
  }

  toggleSubSelected(id: string) {
    if (this.selectedSubscriptionIds.has(id)) {
      this.selectedSubscriptionIds.delete(id);
    } else {
      this.selectedSubscriptionIds.add(id);
    }
    this.cdr.markForCheck();
  }

  toggleSubMaster(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedSubscriptionIds.clear();
    if (checked) {
      for (const [id] of this.cachedSubs) {
        this.selectedSubscriptionIds.add(id);
      }
    }
    this.cdr.markForCheck();
  }

  allSubsSelected(): boolean {
    if (this.cachedSubs.length === 0) {
      return false;
    }
    return this.cachedSubs.every(([id]) => this.selectedSubscriptionIds.has(id));
  }

  addSubscription() {
    if (this.subscribeInProgress) {
      return;
    }
    const payload = this.buildAddPayload();
    if (!payload.url?.trim()) {
      alert('Введите URL');
      return;
    }
    if (payload.splitByChapters && !payload.chapterTemplate.includes('%(section_number)')) {
      alert('Шаблон глав должен содержать %(section_number)');
      return;
    }
    if (!this.validateYtdlOptionsOverrides(payload.ytdlOptionsOverrides)) {
      return;
    }
    this.subscribeInProgress = true;
    this.subscriptionsSvc
      .subscribe({
        ...payload,
        checkIntervalMinutes: this.checkIntervalMinutes,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.subscribeInProgress = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const r = res as { status?: string; msg?: string };
          if (r.status === 'error') {
            alert(r.msg || 'Не удалось добавить подписку');
          } else {
            this.addUrl = '';
          }
        },
      });
  }

  deleteSubscription(id: string) {
    this.subscriptionsSvc.delete([id]).subscribe((res) => {
      const error = this.getStatusError(res);
      if (error) {
        alert(error || 'Не удалось удалить подписку');
        return;
      }
      this.selectedSubscriptionIds.delete(id);
      this.cdr.markForCheck();
    });
  }

  deleteSelectedSubscriptions() {
    const ids = Array.from(this.selectedSubscriptionIds);
    if (!ids.length) {
      return;
    }
    this.subscriptionsSvc.delete(ids).subscribe((res) => {
      const error = this.getStatusError(res);
      if (error) {
        alert(error || 'Не удалось удалить подписки');
        return;
      }
      this.selectedSubscriptionIds.clear();
      this.cdr.markForCheck();
    });
  }

  checkSubscriptionNow(id: string) {
    if (this.checkingSubscriptionIds.has(id)) {
      return;
    }
    this.checkingSubscriptionIds.add(id);
    this.cdr.markForCheck();
    this.subscriptionsSvc
      .checkNow([id])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.checkingSubscriptionIds.delete(id);
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res) => {
        const error = this.getStatusError(res);
        if (error) {
          alert(error || 'Не удалось проверить подписку');
          return;
        }
        this.refreshSubscriptionsWithAlert();
      });
  }

  isSubscriptionChecking(id: string): boolean {
    return this.checkingSubscriptionIds.has(id);
  }

  private runBulkSubscriptionCheck(ids: string[] | undefined, mode: 'all' | 'selected') {
    const targetIds = ids ?? this.cachedSubs.filter(([, row]) => row.enabled).map(([id]) => id);
    if (!targetIds.length) {
      return;
    }

    const checkedIds = new Set(targetIds);
    for (const id of checkedIds) {
      this.checkingSubscriptionIds.add(id);
    }
    if (mode === 'all') {
      this.checkingAllSubscriptions = true;
    } else {
      this.checkingSelectedSubscriptions = true;
    }
    this.cdr.markForCheck();

    this.subscriptionsSvc
      .checkNow(ids)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          for (const id of checkedIds) {
            this.checkingSubscriptionIds.delete(id);
          }
          if (mode === 'all') {
            this.checkingAllSubscriptions = false;
          } else {
            this.checkingSelectedSubscriptions = false;
          }
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res) => {
        const error = this.getStatusError(res);
        if (error) {
          alert(error || 'Не удалось проверить подписку');
          return;
        }
        this.refreshSubscriptionsWithAlert();
      });
  }

  checkSelectedSubscriptions() {
    const ids = Array.from(this.selectedSubscriptionIds);
    if (!ids.length) {
      return;
    }
    this.runBulkSubscriptionCheck(ids, 'selected');
  }

  checkAllSubscriptions() {
    this.runBulkSubscriptionCheck(undefined, 'all');
  }

  toggleSubscriptionEnabled(row: SubscriptionRow) {
    this.subscriptionsSvc.update(row.id, { enabled: !row.enabled }).subscribe((res) => {
      const error = this.getStatusError(res);
      if (error) {
        alert(error || 'Не удалось обновить подписку');
      }
    });
  }

  getPreferredTheme(cookieService: CookieService) {
    let theme = 'auto';
    if (cookieService.check('metube_theme')) {
      theme = cookieService.get('metube_theme');
    }

    return this.themes.find(x => x.id === theme) ?? this.themes.find(x => x.id === 'auto');
  }

  themeChanged(theme: Theme) {
    this.cookieService.set('metube_theme', theme.id, { expires: this.settingsCookieExpiryDays });
    this.setTheme(theme);
  }

  setTheme(theme: Theme) {
    this.activeTheme = theme;
    if (theme.id === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-bs-theme', theme.id);
    }
  }

  formatChanged() {
    this.cookieService.set('metube_format', this.format, { expires: this.settingsCookieExpiryDays });
    this.setQualities();
    this.saveSelection(this.downloadType);
    // Re-trigger custom directory change
    this.downloads.customDirsChanged.next(this.downloads.customDirs);
  }

  autoStartChanged() {
    this.cookieService.set('metube_auto_start', this.autoStart ? 'true' : 'false', { expires: this.settingsCookieExpiryDays });
  }

  splitByChaptersChanged() {
    this.cookieService.set('metube_split_chapters', this.splitByChapters ? 'true' : 'false', { expires: this.settingsCookieExpiryDays });
  }

  chapterTemplateChanged() {
    // Restore default if template is cleared - get from configuration
    if (!this.chapterTemplate || this.chapterTemplate.trim() === '') {
      const configuredTemplate = this.downloads.configuration['OUTPUT_TEMPLATE_CHAPTER'];
      this.chapterTemplate = typeof configuredTemplate === 'string' ? configuredTemplate : '';
    }
    this.cookieService.set('metube_chapter_template', this.chapterTemplate, { expires: this.settingsCookieExpiryDays });
  }

  subtitleLanguageChanged() {
    this.cookieService.set('metube_subtitle_language', this.subtitleLanguage, { expires: this.settingsCookieExpiryDays });
    this.saveSelection(this.downloadType);
  }

  subtitleModeChanged() {
    this.cookieService.set('metube_subtitle_mode', this.subtitleMode, { expires: this.settingsCookieExpiryDays });
    this.saveSelection(this.downloadType);
  }

  ytdlOptionsPresetsChanged() {
    this.cookieService.set(
      'metube_ytdl_options_presets',
      JSON.stringify(this.ytdlOptionsPresets ?? []),
      { expires: this.settingsCookieExpiryDays },
    );
  }

  ytdlOptionsOverridesChanged() {
    this.cookieService.set('metube_ytdl_options_overrides', this.ytdlOptionsOverrides, { expires: this.settingsCookieExpiryDays });
  }

  isVideoType() {
    return this.downloadType === 'video';
  }

  formatQualityLabel(download: Download): string {
    if (download.download_type === 'captions' || download.download_type === 'thumbnail') {
      return '-';
    }
    const q = download.quality;
    if (!q) return '';
    if (/^\d+$/.test(q) && download.download_type === 'audio') return `${q} kbps`;
    if (/^\d+$/.test(q)) return `${q}p`;
    if (q.toLowerCase() === 'best') return 'Лучшее';
    if (q.toLowerCase() === 'worst') return 'Худшее';
    return q.charAt(0).toUpperCase() + q.slice(1);
  }

  downloadTypeLabel(download: Download): string {
    const type = download.download_type || 'video';
    const map: Record<string, string> = {
      video: 'Видео',
      audio: 'Аудио',
      captions: 'Субтитры',
      thumbnail: 'Превью',
    };
    return map[type] ?? (type.charAt(0).toUpperCase() + type.slice(1));
  }

  formatCodecLabel(download: Download): string {
    if (download.download_type !== 'video') {
      const format = (download.format || '').toUpperCase();
      return format || '-';
    }
    const codec = download.codec;
    if (!codec || codec === 'auto') return 'Авто';
    return this.videoCodecs.find(c => c.id === codec)?.text ?? codec;
  }

  queueSelectionChanged(checked: number) {
    this.queueDelSelected().nativeElement.disabled = checked === 0;
    this.queueDownloadSelected().nativeElement.disabled = checked === 0;
  }

  doneSelectionChanged(checked: number) {
    this.doneDelSelected().nativeElement.disabled = checked === 0;
    this.doneDownloadSelected().nativeElement.disabled = checked === 0;
  }

  private updateDoneActionButtons() {
    let completed = 0;
    let failed = 0;
    this.downloads.done.forEach((download) => {
      const isFailed = download.status === 'error';
      const isCompleted = !isFailed && (
        download.status === 'finished' ||
        download.status === 'completed' ||
        Boolean(download.filename)
      );
      if (isCompleted) {
        completed++;
      } else if (isFailed) {
        failed++;
      }
    });
    this.hasCompletedDone = completed > 0;
    this.hasFailedDone = failed > 0;
  }

  setQualities() {
    if (this.downloadType === 'video') {
      this.qualities = this.format === 'ios'
        ? [{ id: 'best', text: 'Лучшее' }]
        : VIDEO_QUALITIES;
    } else if (this.downloadType === 'audio') {
      const selectedFormat = this.audioFormats.find(el => el.id === this.format);
      this.qualities = selectedFormat ? selectedFormat.qualities : [{ id: 'best', text: 'Лучшее' }];
    } else {
      this.qualities = [{ id: 'best', text: 'Лучшее' }];
    }
    const exists = this.qualities.find(el => el.id === this.quality);
    this.quality = exists ? this.quality : 'best';
  }

  refreshFormatOptions() {
    if (this.downloadType === 'video') {
      this.formatOptions = this.videoFormats;
      return;
    }
    if (this.downloadType === 'audio') {
      this.formatOptions = this.audioFormats;
      return;
    }
    if (this.downloadType === 'captions') {
      this.formatOptions = this.captionFormats;
      return;
    }
    this.formatOptions = this.thumbnailFormats;
  }

  showCodecSelector() {
    return this.downloadType === 'video';
  }

  showFormatSelector() {
    return this.downloadType !== 'thumbnail';
  }

  showQualitySelector() {
    if (this.downloadType === 'video') {
      return this.format !== 'ios';
    }
    return this.downloadType === 'audio';
  }

  private normalizeSelectionsForType(resetForTypeChange = false) {
    if (this.downloadType === 'video') {
      const allowedFormats = new Set(this.videoFormats.map(f => f.id));
      if (resetForTypeChange || !allowedFormats.has(this.format)) {
        this.format = 'any';
      }
      const allowedCodecs = new Set(this.videoCodecs.map(c => c.id));
      if (resetForTypeChange || !allowedCodecs.has(this.codec)) {
        this.codec = 'auto';
      }
    } else if (this.downloadType === 'audio') {
      const allowedFormats = new Set(this.audioFormats.map(f => f.id));
      if (resetForTypeChange || !allowedFormats.has(this.format)) {
        this.format = this.audioFormats[0].id;
      }
    } else if (this.downloadType === 'captions') {
      const allowedFormats = new Set(this.captionFormats.map(f => f.id));
      if (resetForTypeChange || !allowedFormats.has(this.format)) {
        this.format = 'srt';
      }
      this.quality = 'best';
    } else {
      this.format = 'jpg';
      this.quality = 'best';
    }
    this.cookieService.set('metube_format', this.format, { expires: this.settingsCookieExpiryDays });
    this.cookieService.set('metube_codec', this.codec, { expires: this.settingsCookieExpiryDays });
  }

  private saveSelection(type: string) {
    if (!type) return;
    const selection = {
      codec: this.codec,
      format: this.format,
      quality: this.quality,
      subtitleLanguage: this.subtitleLanguage,
      subtitleMode: this.subtitleMode,
    };
    this.selectionsByType[type] = selection;
    this.cookieService.set(
      this.selectionCookiePrefix + type,
      JSON.stringify(selection),
      { expires: this.settingsCookieExpiryDays }
    );
  }

  private restoreSelection(type: string) {
    const saved = this.selectionsByType[type];
    if (!saved) return;
    this.codec = saved.codec;
    this.format = saved.format;
    this.quality = saved.quality;
    this.subtitleLanguage = saved.subtitleLanguage;
    this.subtitleMode = saved.subtitleMode;
  }

  private loadSavedSelections() {
    for (const type of this.downloadTypes.map(t => t.id)) {
      const key = this.selectionCookiePrefix + type;
      if (!this.cookieService.check(key)) continue;
      try {
        const raw = this.cookieService.get(key);
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.selectionsByType[type] = {
            codec: String(parsed.codec ?? 'auto'),
            format: String(parsed.format ?? ''),
            quality: String(parsed.quality ?? 'best'),
            subtitleLanguage: String(parsed.subtitleLanguage ?? 'en'),
            subtitleMode: String(parsed.subtitleMode ?? 'prefer_manual'),
          };
        }
      } catch {
        // Ignore malformed cookie values.
      }
    }
  }

  private buildAddPayload(overrides: Partial<AddDownloadPayload> = {}): AddDownloadPayload {
    const allowYtdlOptionsOverrides = this.allowYtdlOptionsOverrides();
    return {
      url: overrides.url ?? this.addUrl,
      downloadType: overrides.downloadType ?? this.downloadType,
      codec: overrides.codec ?? this.codec,
      quality: overrides.quality ?? this.quality,
      format: overrides.format ?? this.format,
      folder: overrides.folder ?? this.folder,
      customNamePrefix: overrides.customNamePrefix ?? this.customNamePrefix,
      playlistItemLimit: overrides.playlistItemLimit ?? this.playlistItemLimit,
      autoStart: overrides.autoStart ?? this.autoStart,
      splitByChapters: overrides.splitByChapters ?? this.splitByChapters,
      chapterTemplate: overrides.chapterTemplate ?? this.chapterTemplate,
      subtitleLanguage: overrides.subtitleLanguage ?? this.subtitleLanguage,
      subtitleMode: overrides.subtitleMode ?? this.subtitleMode,
      ytdlOptionsPresets: overrides.ytdlOptionsPresets ?? [...this.ytdlOptionsPresets],
      ytdlOptionsOverrides: allowYtdlOptionsOverrides
        ? (overrides.ytdlOptionsOverrides ?? this.ytdlOptionsOverrides)
        : '',
    };
  }

  addDownload(overrides: Partial<AddDownloadPayload> = {}) {
    const payload = this.buildAddPayload(overrides);

    // Validate chapter template if chapter splitting is enabled
    if (payload.splitByChapters && !payload.chapterTemplate.includes('%(section_number)')) {
      alert('Шаблон глав должен содержать %(section_number)');
      return;
    }
    if (!this.validateYtdlOptionsOverrides(payload.ytdlOptionsOverrides)) {
      return;
    }

    console.debug('Downloading:', payload);
    this.addInProgress = true;
    this.cancelRequested = false;
    this.addRequestSub?.unsubscribe();
    this.addRequestSub = this.downloads.add(payload).subscribe((status: Status) => {
      if (status.status === 'error' && !this.cancelRequested) {
        alert(`Ошибка добавления URL: ${status.msg}`);
      } else if (status.status !== 'error') {
        this.addUrl = '';
      }
      this.resetAddState();
    });
  }

  cancelAdding() {
    this.cancelRequested = true;
    this.downloads.cancelAdd().subscribe({
      next: () => {
        this.addRequestSub?.unsubscribe();
        this.resetAddState();
      },
      error: (err) => {
        this.cancelRequested = false;
        console.error('Не удалось отменить добавление:', err?.message || err);
      }
    });
  }

  private resetAddState() {
    this.addRequestSub = undefined;
    this.addInProgress = false;
    this.cancelRequested = false;
    this.cdr.markForCheck();
  }

  downloadItemByKey(id: string) {
    this.downloads.startById([id]).subscribe();
  }

  retryDownload(key: string, download: Download) {
    this.addDownload({
      url: download.url,
      downloadType: download.download_type,
      codec: download.codec,
      quality: download.quality,
      format: download.format,
      folder: download.folder,
      customNamePrefix: download.custom_name_prefix,
      playlistItemLimit: download.playlist_item_limit,
      autoStart: true,
      splitByChapters: download.split_by_chapters,
      chapterTemplate: download.chapter_template,
      subtitleLanguage: download.subtitle_language,
      subtitleMode: download.subtitle_mode,
      ytdlOptionsPresets: download.ytdl_options_presets?.length
        ? [...download.ytdl_options_presets]
        : [],
      ytdlOptionsOverrides: download.ytdl_options_overrides ? JSON.stringify(download.ytdl_options_overrides) : '',
    });
    this.downloads.delById('done', [key]).subscribe();
  }

  delDownload(where: State, id: string) {
    this.downloads.delById(where, [id]).subscribe();
  }

  startSelectedDownloads(where: State){
    this.downloads.startByFilter(where, dl => !!dl.checked).subscribe();
  }

  delSelectedDownloads(where: State) {
    this.downloads.delByFilter(where, dl => !!dl.checked).subscribe();
  }

  clearCompletedDownloads() {
    this.downloads.delByFilter('done', dl => dl.status === 'finished').subscribe();
  }

  clearFailedDownloads() {
    this.downloads.delByFilter('done', dl => dl.status === 'error').subscribe();
  }

  retryFailedDownloads() {
    this.downloads.done.forEach((dl, key) => {
      if (dl.status === 'error') {
        this.retryDownload(key, dl);
      }
    });
  }

  downloadSelectedFiles() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.downloads.done.forEach((dl, _) => {
      if (dl.status === 'finished' && dl.checked) {
        const link = document.createElement('a');
        link.href = this.buildDownloadLink(dl);
        link.setAttribute('download', dl.filename);
        link.setAttribute('target', '_self');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  }

  buildDownloadLink(download: Download) {
    let baseDir = this.downloads.configuration["PUBLIC_HOST_URL"];
    if (download.download_type === 'audio' || download.filename.endsWith('.mp3')) {
      baseDir = this.downloads.configuration["PUBLIC_HOST_AUDIO_URL"];
    }

    if (download.folder) {
      baseDir += this.encodeFolderPath(download.folder);
    }

    return baseDir + encodeURIComponent(download.filename);
  }

  buildResultItemTooltip(download: Download) {
    const parts = [];
    if (download.msg) {
      parts.push(download.msg);
    }
    if (download.error) {
      parts.push(download.error);
    }
    return parts.join(' | ');
  }

  buildChapterDownloadLink(download: Download, chapterFilename: string) {
    let baseDir = this.downloads.configuration["PUBLIC_HOST_URL"];
    if (download.download_type === 'audio' || chapterFilename.endsWith('.mp3')) {
      baseDir = this.downloads.configuration["PUBLIC_HOST_AUDIO_URL"];
    }

    if (download.folder) {
      baseDir += this.encodeFolderPath(download.folder);
    }

    return baseDir + encodeURIComponent(chapterFilename);
  }

  private encodeFolderPath(folder: string): string {
    return folder
      .split('/')
      .filter(segment => segment.length > 0)
      .map(segment => encodeURIComponent(segment))
      .join('/') + '/';
  }

  getChapterFileName(filepath: string) {
    // Extract just the filename from the path
    const parts = filepath.split('/');
    return parts[parts.length - 1];
  }

  isNumber(event: KeyboardEvent) {
    const allowedControlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowedControlKeys.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  // Toggle inline batch panel (if you want to use an inline panel for export; not used for import modal)
  toggleBatchPanel(): void {
    this.showBatchPanel = !this.showBatchPanel;
  }

  // Open the Batch Import modal
  openBatchImportModal(): void {
    this.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.batchImportModalOpen = true;
    this.batchImportText = '';
    this.batchImportStatus = '';
    this.importInProgress = false;
    this.cancelImportFlag = false;
    setTimeout(() => {
      const textarea = document.getElementById('batch-import-textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
      }
    }, 0);
  }

  // Close the Batch Import modal
  closeBatchImportModal(): void {
    this.batchImportModalOpen = false;
    this.lastFocusedElement?.focus();
  }

  // Start importing URLs from the batch modal textarea
  startBatchImport(): void {
    const urls = this.batchImportText
      .split(/\r?\n/)
      .map(url => url.trim())
      .filter(url => url.length > 0);
    if (urls.length === 0) {
      alert('Не найдено валидных URL.');
      return;
    }
    this.importInProgress = true;
    this.cancelImportFlag = false;
    this.batchImportStatus = `Начинаю импорт ${urls.length} URL...`;
    let index = 0;
    const delayBetween = 1000;
    const processNext = () => {
      if (this.cancelImportFlag) {
        this.batchImportStatus = `Импорт отменен: ${index} из ${urls.length} URL.`;
        this.importInProgress = false;
        return;
      }
      if (index >= urls.length) {
        this.batchImportStatus = `Импорт завершен: ${urls.length} URL.`;
        this.importInProgress = false;
        return;
      }
      const url = urls[index];
      this.batchImportStatus = `Импорт URL ${index + 1} из ${urls.length}: ${url}`;
      // Pass current selection options to backend
      this.downloads.add(this.buildAddPayload({ url }))
        .subscribe({
          next: (status: Status) => {
            if (status.status === 'error') {
              alert(`Ошибка добавления URL ${url}: ${status.msg}`);
            }
            index++;
            setTimeout(processNext, delayBetween);
          },
          error: (err) => {
            console.error(`Ошибка импорта URL ${url}:`, err);
            index++;
            setTimeout(processNext, delayBetween);
          }
        });
    };
    processNext();
  }

  // Cancel the batch import process
  cancelBatchImport(): void {
    if (this.importInProgress) {
      this.cancelImportFlag = true;
      this.batchImportStatus += ' Отмена...';
    }
  }

  // Export URLs based on filter: 'pending', 'completed', 'failed', or 'all'
  exportBatchUrls(filter: 'pending' | 'completed' | 'failed' | 'all'): void {
    let urls: string[];
    if (filter === 'pending') {
      urls = Array.from(this.downloads.queue.values()).map(dl => dl.url);
    } else if (filter === 'completed') {
      // Only finished downloads in the "done" Map
      urls = Array.from(this.downloads.done.values()).filter(dl => dl.status === 'finished').map(dl => dl.url);
    } else if (filter === 'failed') {
      // Only error downloads from the "done" Map
      urls = Array.from(this.downloads.done.values()).filter(dl => dl.status === 'error').map(dl => dl.url);
    } else {
      // All: pending + both finished and error in done
      urls = [
        ...Array.from(this.downloads.queue.values()).map(dl => dl.url),
        ...Array.from(this.downloads.done.values()).map(dl => dl.url)
      ];
    }
    if (!urls.length) {
      alert('Для выбранного фильтра URL не найдены.');
      return;
    }
    const content = urls.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'metube_urls.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  // Copy URLs to clipboard based on filter: 'pending', 'completed', 'failed', or 'all'
  copyBatchUrls(filter: 'pending' | 'completed' | 'failed' | 'all'): void {
    let urls: string[];
    if (filter === 'pending') {
      urls = Array.from(this.downloads.queue.values()).map(dl => dl.url);
    } else if (filter === 'completed') {
      urls = Array.from(this.downloads.done.values()).filter(dl => dl.status === 'finished').map(dl => dl.url);
    } else if (filter === 'failed') {
      urls = Array.from(this.downloads.done.values()).filter(dl => dl.status === 'error').map(dl => dl.url);
    } else {
      urls = [
        ...Array.from(this.downloads.queue.values()).map(dl => dl.url),
        ...Array.from(this.downloads.done.values()).map(dl => dl.url)
      ];
    }
    if (!urls.length) {
      alert('Для выбранного фильтра URL не найдены.');
      return;
    }
    const content = urls.join('\n');
    navigator.clipboard.writeText(content)
      .then(() => alert('URL скопированы в буфер обмена.'))
      .catch(() => alert('Не удалось скопировать URL.'));
  }

  fetchVersionInfo(): void {
    // eslint-disable-next-line no-useless-escape    
    const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '/')}`;
    const versionUrl = `${baseUrl}version`;
    this.http.get<{ 'yt-dlp': string, version: string }>(versionUrl)
      .subscribe({
        next: (data) => {
          this.ytDlpVersion = data['yt-dlp'];
          this.metubeVersion = data.version;
        },
        error: () => {
          this.ytDlpVersion = null;
          this.metubeVersion = null;
        }
      });
  }

  toggleAdvanced() {
    this.isAdvancedOpen = !this.isAdvancedOpen;
  }

  toggleSortOrder() {
    this.sortAscending = !this.sortAscending;
    this.cookieService.set('metube_sort_ascending', this.sortAscending ? 'true' : 'false', { expires: this.settingsCookieExpiryDays });
    this.rebuildSortedDone();
  }

  private rebuildSortedDone() {
    const result: [string, Download][] = [];
    this.downloads.done.forEach((dl, key) => {
      result.push([key, dl]);
    });
    if (!this.sortAscending) {
      result.reverse();
    }
    this.cachedSortedDone = result;
  }

  toggleErrorDetail(id: string) {
    if (this.expandedErrors.has(id)) this.expandedErrors.delete(id);
    else this.expandedErrors.add(id);
  }

  copyErrorMessage(id: string, download: Download) {
    const parts: string[] = [];
    if (download.title) parts.push(`Название: ${download.title}`);
    if (download.url) parts.push(`URL: ${download.url}`);
    if (download.msg) parts.push(`Сообщение: ${download.msg}`);
    if (download.error) parts.push(`Ошибка: ${download.error}`);
    const text = parts.join('\n');
    if (!text.trim()) return;
    const done = () => {
      this.lastCopiedErrorId = id;
      setTimeout(() => { this.lastCopiedErrorId = null; }, 1500);
    };
    const fail = (err?: unknown) => {
      console.error('Не удалось записать в буфер обмена:', err);
      alert('Не удалось скопировать в буфер обмена. Для доступа к буферу браузеру может требоваться HTTPS.');
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        fail(e);
      }
    }
  }

  isErrorExpanded(id: string): boolean {
    return this.expandedErrors.has(id);
  }

  onCookieFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.cookieUploadInProgress = true;
    this.downloads.uploadCookies(input.files[0]).subscribe({
      next: (response) => {
        if (response?.status === 'ok') {
          this.hasCookies = true;
        } else {
          this.refreshCookieStatus();
          alert(`Ошибка загрузки cookies: ${this.formatErrorMessage(response?.msg)}`);
        }
        this.cookieUploadInProgress = false;
        input.value = '';
      },
      error: () => {
        this.refreshCookieStatus();
        this.cookieUploadInProgress = false;
        input.value = '';
        alert('Ошибка загрузки cookies.');
      }
    });
  }

  private formatErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      for (const key of ['msg', 'reason', 'error', 'detail']) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }
      try {
        return JSON.stringify(error);
      } catch {
        return 'Неизвестная ошибка';
      }
    }
    return 'Неизвестная ошибка';
  }

  deleteCookies() {
    this.downloads.deleteCookies().subscribe({
      next: (response) => {
        if (response?.status === 'ok') {
          this.refreshCookieStatus();
          return;
        }
        this.refreshCookieStatus();
        alert(`Ошибка удаления cookies: ${this.formatErrorMessage(response?.msg)}`);
      },
      error: () => {
        this.refreshCookieStatus();
        alert('Ошибка удаления cookies.');
      }
    });
  }

  private refreshCookieStatus() {
    this.downloads.getCookieStatus().subscribe(data => {
      this.hasCookies = !!(data && typeof data === 'object' && 'has_cookies' in data && data.has_cookies);
    });
  }

  private updateMetrics() {
    let active = 0;
    let queued = 0;
    let completed = 0;
    let failed = 0;
    let speed = 0;

    this.downloads.queue.forEach((download) => {
      if (download.status === 'downloading') {
        active++;
        speed += download.speed || 0;
      } else if (download.status === 'preparing') {
        active++;
      } else if (download.status === 'pending') {
        queued++;
      }
    });

    this.downloads.done.forEach((download) => {
      if (download.status === 'finished') {
        completed++;
      } else if (download.status === 'error') {
        failed++;
      }
    });

    this.activeDownloads = active;
    this.queuedDownloads = queued;
    this.completedDownloads = completed;
    this.failedDownloads = failed;
    this.totalSpeed = speed;
  }
}
