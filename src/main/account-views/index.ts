import { BrowserView, dialog, session } from 'electron'
import * as path from 'path'
import {
  addCustomCSS,
  initCustomStyles,
  setBurgerMenuOffset
} from './custom-styles'
import { enableAutoFixUserAgent } from '../user-agent'
import { getMainWindow } from '../main-window'
import { getSelectedAccount, isDefaultAccount } from '../accounts'
import {
  topElementHeight,
  gmailUrl,
  appName,
  gitHubRepoUrl,
  googleAccountsUrl
} from '../../constants'
import { is } from 'electron-util'
import { addContextMenu } from './context-menu'
import { getIsUpdateAvailable } from '../updater'
import { openExternalUrl } from '../utils/url'
import config, { ConfigKey } from '../config'
import { initBlocker } from './blocker'

const accountViews = new Map<string, BrowserView>()

export function getAccountView(accountId: string) {
  const accountView = accountViews.get(accountId)
  if (!accountView) {
    throw new Error('Account view is unitialized or has been destroyed')
  }

  return accountView
}

export function getAccountIdByViewId(accountViewId: number) {
  for (const [accountId, accountView] of accountViews) {
    if (accountView.webContents.id === accountViewId) {
      return accountId
    }
  }

  return undefined
}

export function getHasMultipleAccounts() {
  return accountViews.size > 1
}

export function sendToSelectedAccountView(channel: string, ...args: unknown[]) {
  const selectedAccount = getSelectedAccount()
  if (selectedAccount) {
    const selectedView = accountViews.get(selectedAccount.id)
    if (selectedView) {
      selectedView.webContents.send(channel, ...args)
    }
  }
}

export function sendToAccountViews(channel: string, ...args: unknown[]) {
  for (const [_accountId, accountView] of accountViews) {
    accountView.webContents.send(channel, ...args)
  }
}

export function selectAccountView(accountId: string) {
  const accountView = getAccountView(accountId)
  const mainWindow = getMainWindow()

  mainWindow.setTopBrowserView(accountView)
  accountView.webContents.focus()
  accountView.webContents.send('account-selected')
}

export function forEachAccountView(
  callback: (accountView: BrowserView) => void
) {
  for (const [_accountId, accountView] of accountViews) {
    callback(accountView)
  }
}

export function updateAccountViewBounds(accountView: BrowserView) {
  const { width, height } = getMainWindow().getBounds()

  let offset =
    is.macos || config.get(ConfigKey.TitleBarStyle) === 'system' ? 0 : 30 // Linux/Window Title Bar

  if (getHasMultipleAccounts()) {
    offset += topElementHeight
  }

  if (getIsUpdateAvailable()) {
    offset += topElementHeight
  }

  accountView.setBounds({
    x: 0,
    y: offset || 0,
    width,
    height: offset ? height - offset : height
  })

  setBurgerMenuOffset(accountView)
}

export function updateAllAccountViewBounds() {
  for (const [_accountId, accountView] of accountViews) {
    updateAccountViewBounds(accountView)
  }
}

export function removeAccountView(accountId: string) {
  const accountView = getAccountView(accountId)
  const mainWindow = getMainWindow()

  mainWindow.removeBrowserView(accountView)
  // @ts-expect-error Electron's type definitions are incomplete for webContents.destroy
  // This is used to prevent memory leaks
  accountView.webContents.destroy()
  session.fromPartition(`persist:${accountId}`).clearStorageData()
  accountViews.delete(accountId)

  updateAllAccountViewBounds()
}

export function getSelectedAccountView() {
  const selectedAccount = getSelectedAccount()
  if (!selectedAccount) {
    return
  }

  return accountViews.get(selectedAccount.id)
}

export function getSessionPartitionKey(accountId: string) {
  return isDefaultAccount(accountId) ? undefined : `persist:${accountId}`
}

export function createAccountView(accountId: string, setAsTopView?: boolean) {
  const sessionPartitionKey = getSessionPartitionKey(accountId)
  const accountSession = sessionPartitionKey
    ? session.fromPartition(sessionPartitionKey)
    : session.defaultSession

  accountSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'notifications') {
        callback(false)
      }
    }
  )

  initBlocker(accountSession)

  const preloadPath = path.join(__dirname, 'preload', 'account-view.js')
  const accountView = new BrowserView({
    webPreferences: {
      partition: sessionPartitionKey,
      preload: preloadPath,
      contextIsolation: false,
      nodeIntegration: true,
      webviewTag: true
    }
  })

  accountViews.set(accountId, accountView)

  const mainWindow = getMainWindow()

  mainWindow.addBrowserView(accountView)

  if (setAsTopView) {
    mainWindow.setTopBrowserView(accountView)
  }

  addContextMenu(accountView)

  accountView.webContents.loadURL(gmailUrl)

  accountView.webContents.on('dom-ready', () => {
    addCustomCSS(accountView)
    initCustomStyles(accountView)
  })

  accountView.webContents.on('did-finish-load', async () => {
    if (accountView.webContents.getURL().includes('signin/rejected')) {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        message: `It looks like you are unable to sign-in, because Gmail is blocking the user agent ${appName} is using.`,
        detail: `Do you want ${appName} to attempt to fix it automatically? If that doesn't work, you can try to set another user agent yourself or ask for help (see "Troubleshoot").`,
        buttons: ['Yes', 'Cancel', 'Troubleshoot']
      })

      if (response === 2) {
        openExternalUrl(
          `${gitHubRepoUrl}#i-cant-sign-in-this-browser-or-app-may-not-be-secure`
        )
        return
      }

      if (response === 1) {
        return
      }

      enableAutoFixUserAgent()
    }
  })

  accountView.webContents.on('will-navigate', (event, url) => {
    // Allow navigation within Gmail
    if (url.startsWith(gmailUrl) || url.startsWith(googleAccountsUrl)) {
      return
    }

    event.preventDefault()

    openExternalUrl(url)
  })

  accountView.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  accountView.webContents.on('will-redirect', (event, url) => {
    // Sometimes Gmail is redirecting to the landing page instead of login.
    if (url.startsWith('https://www.google.com')) {
      event.preventDefault()

      accountView.webContents.loadURL(
        `${googleAccountsUrl}/ServiceLogin?service=mail&color_scheme=dark`
      )
    }

    // Apply dark theme on login page
    if (url.startsWith(googleAccountsUrl)) {
      event.preventDefault()

      accountView.webContents.loadURL(
        `${url.replace('WebLiteSignIn', 'GlifWebSignIn')}&color_scheme=dark`
      )
    }
  })

  // Handle any remaining new window attempts
  // @ts-expect-error Electron's type definitions are incomplete for webContents events
  accountView.webContents.on('new-window', (event, url) => {
    event.preventDefault()

    openExternalUrl(url)
  })
}

export function hideAccountViews() {
  const mainWindow = getMainWindow()
  for (const [_accountId, accountView] of accountViews) {
    mainWindow.removeBrowserView(accountView)
  }
}

export function showAccountViews() {
  const mainWindow = getMainWindow()
  for (const [_accountId, accountView] of accountViews) {
    mainWindow.addBrowserView(accountView)
  }

  const selectedAccount = getSelectedAccount()
  if (selectedAccount) {
    selectAccountView(selectedAccount.id)
  }
}
