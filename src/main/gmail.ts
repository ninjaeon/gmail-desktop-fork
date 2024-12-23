import { app, ipcMain, Notification } from 'electron'
import { getAccountIdByViewId } from './account-views'
import { getAccount, selectAccount } from './accounts'
import { sendToMainWindow, showMainWindow } from './main-window'
import config, { ConfigKey } from './config'
import { is } from 'electron-util'
import { updateTrayUnreadStatus } from './tray'
import { Mail, UnreadCounts } from '../types'
import { isEnabled as isDoNotDisturbEnabled } from '@sindresorhus/do-not-disturb'

const unreadCounts: UnreadCounts = {}

export function getTotalUnreadCount() {
  let totalUnreadCount = 0

  for (const unreadCount of Object.values(unreadCounts)) {
    totalUnreadCount += unreadCount
  }

  return totalUnreadCount
}

export function newMailNotification(
  { messageId, sender, subject, summary }: Mail,
  accountViewWebContents: Electron.WebContents
) {
  const accountId = getAccountIdByViewId(accountViewWebContents.id)

  if (!accountId) {
    return
  }

  const account = getAccount(accountId)

  if (!account) {
    return
  }

  let subtitle: string | undefined

  if (is.macos && config.get(ConfigKey.NotificationsShowSubject)) {
    subtitle = subject
  }

  let body: string | undefined

  if (is.macos && config.get(ConfigKey.NotificationsShowSummary)) {
    body = summary
  } else if (!is.macos && config.get(ConfigKey.NotificationsShowSubject)) {
    body = subject
  }

  const notification = new Notification({
    title: config.get(ConfigKey.NotificationsShowSender)
      ? sender.name
      : account.label,
    subtitle,
    body,
    silent: !config.get(ConfigKey.NotificationsPlaySound),
    actions: [
      {
        text: 'Archive',
        type: 'button'
      },
      {
        text: 'Mark As Read',
        type: 'button'
      },
      {
        text: 'Delete',
        type: 'button'
      },
      {
        text: 'Mark As Spam',
        type: 'button'
      }
    ]
  })

  notification.on('action', (_event, index) => {
    switch (index) {
      case 1:
        accountViewWebContents.send('gmail:mark-mail-as-read', messageId)
        break
      case 2:
        accountViewWebContents.send('gmail:delete-mail', messageId)
        break
      case 3:
        accountViewWebContents.send('gmail:mark-mail-as-spam', messageId)
        break
      default:
        accountViewWebContents.send('gmail:archive-mail', messageId)
    }
  })

  notification.on('click', () => {
    showMainWindow()
    selectAccount(account.id)
    accountViewWebContents.send('gmail:open-mail', messageId)
  })

  notification.show()
}

export function handleGmail() {
  ipcMain.on('gmail:unread-count', ({ sender }, unreadCount: number) => {
    console.log('[Gmail Desktop] Received unread count:', unreadCount)
    const accountId = getAccountIdByViewId(sender.id)
    if (accountId) {
      unreadCounts[accountId] = unreadCount

      const totalUnreadCount = getTotalUnreadCount()
      console.log('[Gmail Desktop] Total unread count:', totalUnreadCount)

      if (is.macos) {
        app.dock.setBadge(totalUnreadCount ? totalUnreadCount.toString() : '')
      }

      updateTrayUnreadStatus(totalUnreadCount)
      sendToMainWindow('unread-counts-updated', unreadCounts)
    }
  })

  if (Notification.isSupported()) {
    console.log('[Gmail Desktop] Notifications are supported')
    ipcMain.on('gmail:new-mails', async (event, mails: Mail[]) => {
      console.log('[Gmail Desktop] Received new mails event:', mails.length)
      
      const notificationsEnabled = config.get(ConfigKey.NotificationsEnabled)
      console.log('[Gmail Desktop] Notifications enabled:', notificationsEnabled)
      
      if (
        !notificationsEnabled ||
        (is.macos && (await isDoNotDisturbEnabled()))
      ) {
        console.log('[Gmail Desktop] Notifications blocked by settings')
        return
      }

      for (const mail of mails) {
        console.log('[Gmail Desktop] Creating notification for:', mail.subject)
        newMailNotification(mail, event.sender)
      }
    })
  } else {
    console.log('[Gmail Desktop] Notifications are NOT supported')
  }
}
