import * as path from 'path'
import { app, BrowserWindow, nativeTheme, ipcMain } from 'electron'
import { is } from 'electron-util'
import config, { ConfigKey } from '../config'
import { toggleAppVisiblityTrayItem } from '../tray'
import {
  getSelectedAccountView,
  updateAllAccountViewBounds
} from '../account-views'
import { getIsQuittingApp, shouldLaunchMinimized } from '../app'
import { openExternalUrl } from '../utils/url'
import { getAppMenu } from '../menus/app'
import debounce from 'lodash.debounce'
import indexHTML from './index.html'
import { darkTheme } from '../../theme'
import { mainWindowMinWidth } from '../../constants'

let mainWindow: BrowserWindow | undefined
let isInitialLaunch = true

export function getMainWindow() {
  if (!mainWindow) {
    throw new Error('Main window is uninitialized or has been destroyed')
  }

  return mainWindow
}

export function showMainWindow() {
  if (!mainWindow) {
    throw new Error('Main window is uninitialized or has been destroyed')
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
}

export function sendToMainWindow(channel: string, ...args: any[]) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function createMainWindow(): void {
  const lastWindowState = config.get(ConfigKey.LastWindowState)

  try {
    mainWindow = new BrowserWindow({
      title: app.name,
      titleBarStyle:
        config.get(ConfigKey.TitleBarStyle) === 'app' ? 'hiddenInset' : 'default',
      frame: config.get(ConfigKey.TitleBarStyle) === 'system',
      minWidth: mainWindowMinWidth,
      width: lastWindowState.bounds.width,
      minHeight: 200,
      height: lastWindowState.bounds.height,
      x: lastWindowState.bounds.x,
      y: lastWindowState.bounds.y,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload', 'main-window.js')
      },
      show: false, // Changed to always start hidden initially
      icon: is.linux
        ? path.join(__dirname, '..', '..', 'static', 'icon.png')
        : undefined,
      darkTheme: nativeTheme.shouldUseDarkColors,
      backgroundColor: nativeTheme.shouldUseDarkColors
        ? darkTheme.bg[0]
        : undefined
    })

    if (!mainWindow) {
      console.error('Failed to create main window')
      return
    }

    if (lastWindowState.fullscreen && !mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(lastWindowState.fullscreen)
    }

    if (lastWindowState.maximized && !mainWindow.isMaximized()) {
      mainWindow.maximize()
    }

    if (!is.macos) {
      const hideMenuBar = config.get(ConfigKey.AutoHideMenuBar)
      mainWindow.setMenuBarVisibility(!hideMenuBar)
      mainWindow.autoHideMenuBar = hideMenuBar
    }

    mainWindow.loadFile(path.resolve(__dirname, indexHTML))

    mainWindow.on('close', (event) => {
      if (is.macos && mainWindow?.isFullScreen()) {
        mainWindow?.once('leave-full-screen', () => {
          mainWindow?.hide()
        })
        mainWindow?.setFullScreen(false)
      }

      if (!getIsQuittingApp() && mainWindow) {
        event.preventDefault()
        mainWindow?.blur()
        mainWindow?.hide()
      }
    })

    mainWindow.on('hide', () => {
      toggleAppVisiblityTrayItem(false)
    })

    mainWindow.on('show', () => {
      toggleAppVisiblityTrayItem(true)
    })

    mainWindow.on('focus', () => {
      const selectedAccountView = getSelectedAccountView()
      if (selectedAccountView) {
        selectedAccountView.webContents.focus()
      }
    })

    let debouncedUpdateAllAccountViewBounds: () => void

    if (is.linux) {
      debouncedUpdateAllAccountViewBounds = debounce(
        updateAllAccountViewBounds,
        200
      )
    }

    mainWindow.on('resize', () => {
      if (is.linux) {
        debouncedUpdateAllAccountViewBounds?.()
      } else {
        updateAllAccountViewBounds()
      }
    })

    mainWindow.webContents.on('dom-ready', () => {
      if (isInitialLaunch) {
        if (!shouldLaunchMinimized()) {
          mainWindow?.show()
        } else {
          // Ensure the window is hidden and the tray is properly updated
          mainWindow?.hide()
          toggleAppVisiblityTrayItem(false)
        }
        isInitialLaunch = false
      }
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
      openExternalUrl(url)
    })

    if (!is.macos) {
      if (is.linux) {
        const debouncedIsMaximized = debounce(() => {
          if (mainWindow) {
            sendToMainWindow(
              mainWindow.isMaximized() ? 'window:maximized' : 'window:unmaximized'
            )
          }
        }, 200)

        mainWindow.on('resize', debouncedIsMaximized)
      } else {
        mainWindow.on('maximize', () => {
          sendToMainWindow('window:maximized')
        })

        mainWindow.on('unmaximize', () => {
          sendToMainWindow('window:unmaximized')
        })
      }

      ipcMain.handle('window:is-maximized', () => {
        if (is.linux) {
          setTimeout(() => {
            if (mainWindow) {
              sendToMainWindow(
                mainWindow.isMaximized()
                  ? 'window:maximized'
                  : 'window:unmaximized'
              )
            }
          }, 200)
        } else if (mainWindow) {
          return mainWindow.isMaximized()
        }

        return false
      })

      ipcMain.on('window:minimize', () => {
        mainWindow?.minimize()
      })

      ipcMain.on('window:maximize', () => {
        mainWindow?.maximize()
      })

      ipcMain.on('window:unmaximize', () => {
        mainWindow?.unmaximize()
      })

      ipcMain.on('window:close', () => {
        if (mainWindow) {
          mainWindow.close()
        }
      })

      ipcMain.handle(
        'title-bar:is-enabled',
        () => config.get(ConfigKey.TitleBarStyle) === 'app'
      )

      ipcMain.on('title-bar:open-app-menu', () => {
        const appMenu = getAppMenu()
        appMenu.popup({
          window: mainWindow
        })
      })
    }
  } catch (error) {
    console.error('Error creating main window:', error)
  }
}
