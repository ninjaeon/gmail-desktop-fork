import { ipcRenderer as ipc } from 'electron'
import { ConfigKey } from '../../config'
import initDarkMode from './dark-mode'
import elementReady = require('element-ready')
import { initGmail } from './gmail'
import { initUrlPreview } from './url-preview'

initGmail()
initDarkMode()
initUrlPreview()

function attachButtonListeners(): void {
  // For windows that won't include the selectors we are expecting,
  //   don't wait for them appear as they never will
  if (!window.location.search.includes('&search=inbox')) {
    return
  }

  const selectors = [
    'lR', // Archive
    'nX' // Delete
  ]

  for (const selector of selectors) {
    const buttonReady = elementReady(`body.xE .G-atb .${selector}`)
    const readyTimeout = setTimeout(() => {
      buttonReady.stop()
    }, 10000)

    buttonReady.then((button) => {
      clearTimeout(readyTimeout)

      if (button) {
        button.addEventListener('click', () => {
          window.close()
        })
      }
    })
  }
}

window.addEventListener('load', () => {
  // Attaching the button listeners to the buttons
  //   that should close the new window
  attachButtonListeners()
})

// Toggle a custom style class when a message is received from the main process
function setCustomStyle(key: ConfigKey, enabled: boolean) {
  document.body.classList[enabled ? 'add' : 'remove'](key)
}

// Toggle a full screen class when a message is received from the main process
function setFullScreen(enabled: boolean) {
  document.body.classList[enabled ? 'add' : 'remove']('full-screen')
}

ipc.on('set-custom-style', (_event: Electron.IpcRendererEvent, key: ConfigKey, enabled: boolean) => {
  setCustomStyle(key, enabled)
})

ipc.on('set-full-screen', (_event: Electron.IpcRendererEvent, enabled: boolean) => {
  setFullScreen(enabled)
})

ipc.on('burger-menu:set-offset', (_event, isOffset: boolean) => {
  document.body.classList[isOffset ? 'add' : 'remove'](
    'gmail-desktop_burger-menu-offset'
  )
})
