import { app, ipcMain } from 'electron'
import { is } from 'electron-util'
import Store = require('electron-store')
import { getPlatformUserAgentFix } from './user-agent'
import { Account } from '../types'
import { defaultAccountId } from '../constants'

interface LastWindowState {
  bounds: {
    width: number
    height: number
    x: number | undefined
    y: number | undefined
  }
  fullscreen: boolean
  maximized: boolean
}

export enum ConfigKey {
  AutoUpdateCheck = 'autoUpdateCheck',
  NotifyUpdateDownloaded = 'notifyUpdateDownloaded',
  SkipUpdateVersion = 'skipUpdateVersion',
  CompactHeader = 'compactHeader',
  HideFooter = 'hideFooter',
  HideSupport = 'hideSupport',
  LastWindowState = 'lastWindowState',
  LaunchMinimized = 'launchMinimized',
  AutoHideMenuBar = 'autoHideMenuBar',
  EnableTrayIcon = 'enableTrayIcon',
  ShowDockIcon = 'showDockIcon',
  CustomUserAgent = 'customUserAgent',
  AutoFixUserAgent = 'autoFixUserAgent',
  TrustedHosts = 'trustedHosts',
  ConfirmExternalLinks = 'confirmExternalLinks',
  HardwareAcceleration = 'hardwareAcceleration',
  DownloadsShowSaveAs = 'downloadsShowSaveAs',
  DownloadsOpenFolderWhenDone = 'downloadsOpenFolderWhenDone',
  DownloadsLocation = 'downloadsLocation',
  DarkMode = 'darkMode',
  ResetConfig = 'resetConfig',
  ReleaseChannel = 'releaseChannel',
  Accounts = 'accounts',
  ZoomFactor = 'zoomFactor',
  TitleBarStyle = 'titleBarStyle',
  NotificationsShowSender = 'notificationsShowSender',
  NotificationsShowSubject = 'notificationsShowSubject',
  NotificationsShowSummary = 'notificationsShowSummary',
  NotificationsEnabled = 'notificationsEnabled',
  NotificationsPlaySound = 'notificationsPlaySound',
  BlockerEnabled = 'blocker.enabled',
  BlockerBlockAds = 'blocker.blockAds',
  BlockerBlockAnalytics = 'blocker.blockAnalytics',
  BlockerBlockEmailTrackers = 'blocker.blockTrackers'
}

type TypedStore = {
  [ConfigKey.AutoUpdateCheck]: boolean
  [ConfigKey.NotifyUpdateDownloaded]: boolean
  [ConfigKey.SkipUpdateVersion]: string
  [ConfigKey.LastWindowState]: LastWindowState
  [ConfigKey.CompactHeader]: boolean
  [ConfigKey.HideFooter]: boolean
  [ConfigKey.HideSupport]: boolean
  [ConfigKey.LaunchMinimized]: boolean
  [ConfigKey.AutoHideMenuBar]: boolean
  [ConfigKey.EnableTrayIcon]: boolean
  [ConfigKey.ShowDockIcon]: boolean
  [ConfigKey.CustomUserAgent]: string
  [ConfigKey.AutoFixUserAgent]: boolean
  [ConfigKey.TrustedHosts]: string[]
  [ConfigKey.ConfirmExternalLinks]: boolean
  [ConfigKey.HardwareAcceleration]: boolean
  [ConfigKey.DownloadsShowSaveAs]: boolean
  [ConfigKey.DownloadsOpenFolderWhenDone]: boolean
  [ConfigKey.DownloadsLocation]: string
  [ConfigKey.DarkMode]: 'system' | boolean
  [ConfigKey.ResetConfig]: boolean
  [ConfigKey.ReleaseChannel]: 'stable' | 'dev'
  [ConfigKey.Accounts]: Account[]
  [ConfigKey.ZoomFactor]: number
  [ConfigKey.TitleBarStyle]: 'system' | 'app'
  [ConfigKey.NotificationsShowSender]: boolean
  [ConfigKey.NotificationsShowSubject]: boolean
  [ConfigKey.NotificationsShowSummary]: boolean
  [ConfigKey.NotificationsEnabled]: boolean
  [ConfigKey.NotificationsPlaySound]: boolean
  [ConfigKey.BlockerEnabled]: boolean
  [ConfigKey.BlockerBlockAds]: boolean
  [ConfigKey.BlockerBlockAnalytics]: boolean
  [ConfigKey.BlockerBlockEmailTrackers]: boolean
}

const defaults: TypedStore = {
  [ConfigKey.AutoUpdateCheck]: true,
  [ConfigKey.NotifyUpdateDownloaded]: true,
  [ConfigKey.SkipUpdateVersion]: '',
  [ConfigKey.LastWindowState]: {
    bounds: {
      width: 860,
      height: 600,
      x: undefined,
      y: undefined
    },
    fullscreen: false,
    maximized: false
  },
  [ConfigKey.CompactHeader]: true,
  [ConfigKey.HideFooter]: true,
  [ConfigKey.HideSupport]: true,
  [ConfigKey.LaunchMinimized]: false,
  [ConfigKey.AutoHideMenuBar]: false,
  [ConfigKey.EnableTrayIcon]: !is.macos,
  [ConfigKey.ShowDockIcon]: true,
  [ConfigKey.CustomUserAgent]: '',
  [ConfigKey.AutoFixUserAgent]: true,
  [ConfigKey.TrustedHosts]: [],
  [ConfigKey.ConfirmExternalLinks]: true,
  [ConfigKey.HardwareAcceleration]: true,
  [ConfigKey.DownloadsShowSaveAs]: false,
  [ConfigKey.DownloadsOpenFolderWhenDone]: false,
  [ConfigKey.DownloadsLocation]: app.getPath('downloads'),
  [ConfigKey.DarkMode]: 'system',
  [ConfigKey.ResetConfig]: false,
  [ConfigKey.ReleaseChannel]: 'stable',
  [ConfigKey.Accounts]: [
    {
      id: defaultAccountId,
      label: 'Default',
      selected: true
    }
  ],
  [ConfigKey.ZoomFactor]: 1,
  [ConfigKey.TitleBarStyle]: 'app',
  [ConfigKey.NotificationsShowSender]: true,
  [ConfigKey.NotificationsShowSubject]: true,
  [ConfigKey.NotificationsShowSummary]: true,
  [ConfigKey.NotificationsEnabled]: true,
  [ConfigKey.NotificationsPlaySound]: false,
  [ConfigKey.BlockerEnabled]: true,
  [ConfigKey.BlockerBlockAds]: true,
  [ConfigKey.BlockerBlockAnalytics]: true,
  [ConfigKey.BlockerBlockEmailTrackers]: true
}

const config = new Store<TypedStore>({
  defaults,
  name: is.development ? 'config.dev' : 'config',
  accessPropertiesByDotNotation: false,
  migrations: {
    '>=2.21.2': (store) => {
      const hideRightSidebar = store.get(ConfigKey.HideRightSidebar)

      if (typeof hideRightSidebar === 'boolean') {
        store.delete(ConfigKey.HideRightSidebar)
      }
    },
    '>2.21.2': (store) => {
      const overrideUserAgent = store.get(ConfigKey.OverrideUserAgent)

      if (typeof overrideUserAgent === 'string') {
        if (overrideUserAgent.length > 0) {
          store.set(ConfigKey.CustomUserAgent, overrideUserAgent)
        }

        store.delete(ConfigKey.OverrideUserAgent)
      }
    },
    '>3.0.0-alpha.2': (store) => {
      const customUserAgent = store.get(ConfigKey.CustomUserAgent)

      if (customUserAgent === getPlatformUserAgentFix()) {
        store.set(ConfigKey.CustomUserAgent, '')
      }
    },
    '>3.0.0-alpha.15': (store) => {
      const notificationsSilent = store.get('notificationsSilent')

      if (typeof notificationsSilent === 'boolean') {
        store.set(ConfigKey.NotificationsPlaySound, !notificationsSilent)
        store.delete('notificationsSilent')
      }
    },
    '>3.0.0-alpha.20': (store) => {
      const notificationsDisabled = store.get('notificationsDisabled')

      if (typeof notificationsDisabled === 'boolean') {
        store.set(ConfigKey.NotificationsEnabled, !notificationsDisabled)
        store.delete('notificationsDisabled')
      }
    },
    '>3.0.0-fork.0': (store) => {
      const accounts = store.get(ConfigKey.Accounts)
      if (Array.isArray(accounts)) {
        store.set(ConfigKey.Accounts, accounts)
      }
    }
  }
})

if (config.get(ConfigKey.ResetConfig)) {
  config.clear()
  config.set(ConfigKey.ResetConfig, false)
}

ipcMain.handle('config:compact-header', () =>
  config.get(ConfigKey.CompactHeader)
)

export default config
