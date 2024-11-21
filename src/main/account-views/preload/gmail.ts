// Add TypeScript types for Trusted Types
declare global {
  interface Window {
    GM_INBOX_TYPE: 'CLASSIC' | 'SECTIONED'
    trustedTypes?: {
      createPolicy: (
        name: string,
        policy: {
          createHTML?: (input: string) => string;
          createScript?: (input: string) => string;
          createScriptURL?: (input: string) => string;
        }
      ) => {
        createHTML: (input: string) => TrustedHTML;
        createScript: (input: string) => TrustedScript;
        createScriptURL: (input: string) => TrustedScriptURL;
      };
      getPolicy: (name: string) => {
        createHTML: (input: string) => TrustedHTML;
        createScript: (input: string) => TrustedScript;
        createScriptURL: (input: string) => TrustedScriptURL;
      } | null;
      defaultPolicy?: {
        createHTML: (input: string) => TrustedHTML;
      };
    };
  }
}

// Create a default Trusted Types policy for XML parsing
if (window.trustedTypes) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: (xmlString: string) => {
        // Simple validation that it's actually XML
        if (typeof xmlString !== 'string') {
          throw new Error('Invalid input: not a string')
        }
        return xmlString
      }
    })
    console.log('[Gmail Desktop] Created default Trusted Types policy')
  } catch (error) {
    console.error('[Gmail Desktop] Failed to create Trusted Types policy:', error)
  }
}

import { ipcRenderer, IpcRendererEvent } from 'electron'
import elementReady from 'element-ready'
import { gmailUrl } from '../../../constants'
import { Mail } from '../../../types'
import {
  domParser,
  getContentBySelector,
  getDateBySelector,
  getNumberBySelector
} from '../../utils/dom'

const mailActions = {
  archive: 'rc_^i',
  markAsRead: 'rd',
  delete: 'tr',
  markAsSpam: 'sp'
}

const inboxElementSelector = 'span > a[href*="#inbox"]'

let actionToken: string | undefined
let inboxParentElement: Element | undefined
let previousUnreadCount: number | undefined
let isInitialNewMailsFetch = true
let feedVersion = 0
let previousModifiedFeedDate = 0
let currentModifiedFeedDate = 0
let previousNewMails = new Set<string>()
let unreadCountObserver: MutationObserver | undefined

async function gmailRequest(
  path = '',
  fetchOptions?: Parameters<typeof fetch>[1]
) {
  return fetch(`${gmailUrl}${path}`, fetchOptions)
}

async function observeUnreadInbox() {
  await findInboxParentElement()

  if (inboxParentElement) {
    getUnreadInbox()
    unreadCountObserver = new MutationObserver(() => {
      getUnreadInbox()
    })
    unreadCountObserver.observe(inboxParentElement, {
      subtree: true,
      characterData: true,
      childList: true
    })

    // Start polling for new emails
    const pollInterval = setInterval(async () => {
      await fetchNewMails(true)
    }, 10_000) // Check every 10 seconds

    // Initial check
    void fetchNewMails(true)

    // Clear interval on unload
    window.addEventListener('unload', () => {
      clearInterval(pollInterval)
    })
  }
}

async function fetchNewMails(sendUnreadCount?: boolean) {
  const isInboxSectioned = window.GM_INBOX_TYPE === 'SECTIONED'
  const label = isInboxSectioned ? '/^sq_ig_i_personal' : ''
  const version = ++feedVersion

  console.log('[Gmail Desktop] Checking for new emails...')

  try {
    const response = await gmailRequest(`feed/atom${label}?v=${version}`)
    const xmlText = await response.text()
    
    let feedDocument: Document
    
    try {
      // Use DOMParser with the default Trusted Types policy
      feedDocument = new DOMParser().parseFromString(xmlText, 'text/xml')
      
      // Check for parsing errors
      const parserError = feedDocument.querySelector('parsererror')
      if (parserError) {
        throw new Error(`XML parsing error: ${parserError.textContent}`)
      }
    } catch (parseError) {
      console.error('[Gmail Desktop] Failed to parse XML:', parseError)
      return
    }

    previousModifiedFeedDate = currentModifiedFeedDate
    currentModifiedFeedDate = getDateBySelector(feedDocument, 'modified')

    const isFeedModified = previousModifiedFeedDate !== currentModifiedFeedDate

    if (!isFeedModified) {
      console.log('[Gmail Desktop] No new emails found')
      return
    }

    if (sendUnreadCount) {
      const unreadCount = getNumberBySelector(feedDocument, 'fullcount')
      console.log('[Gmail Desktop] Unread count:', unreadCount)
      ipcRenderer.send('gmail:unread-count', unreadCount)
    }

    const newMails = parseNewMails(feedDocument)
    console.log('[Gmail Desktop] New emails found:', newMails.length)

    // Don't notify about new mails on first start
    if (isInitialNewMailsFetch) {
      console.log('[Gmail Desktop] Initial fetch - skipping notifications')
      isInitialNewMailsFetch = false
    } else if (newMails.length > 0) {
      console.log('[Gmail Desktop] Sending new mail notifications')
      ipcRenderer.send('gmail:new-mails', newMails)
    }
  } catch (error) {
    console.error('[Gmail Desktop] Error checking for new emails:', error)
  }
}

async function sendMailAction(
  mailId: string,
  action: keyof typeof mailActions
) {
  await fetchActionToken()

  if (!actionToken) {
    throw new Error('Action token is missing')
  }

  const parameters = new URLSearchParams({
    t: mailId,
    at: actionToken,
    act: mailActions[action]
  }).toString()

  return gmailRequest(`?${parameters}`)
}

async function fetchActionToken() {
  if (!actionToken) {
    const gmailDocument = await gmailRequest().then(async (response) =>
      response.text()
    )

    actionToken = /var GM_ACTION_TOKEN="([\w-]+)";/.exec(gmailDocument)?.[1]
  }
}

function refreshInbox() {
  if (window.location.hash.startsWith('#inbox')) {
    const inboxElement = getInboxElement()
    if (inboxElement) {
      inboxElement.click()
    }
  }
}

async function findInboxParentElement() {
  const inboxElement = await elementReady(inboxElementSelector, {
    stopOnDomReady: false
  })

  inboxParentElement =
    inboxElement?.parentElement?.parentElement?.parentElement?.parentElement
      ?.parentElement?.parentElement ?? undefined
}

function getInboxElement() {
  return (
    document.querySelector<HTMLAnchorElement>(inboxElementSelector) ?? undefined
  )
}

function getUnreadInbox() {
  const inboxElement = getInboxElement()

  if (!inboxElement) {
    return
  }

  const unreadCountElement =
    inboxElement.parentElement?.parentElement?.querySelector('.bsU') ??
    undefined

  const currentUnreadCount = unreadCountElement?.textContent
    ? Number(unreadCountElement.textContent)
    : 0

  if (previousUnreadCount !== currentUnreadCount) {
    ipcRenderer.send('gmail:unread-count', currentUnreadCount)
    fetchNewMails()
    previousUnreadCount = currentUnreadCount
  }
}

function parseNewMails(feedDocument: Document) {
  const newMails: Mail[] = []
  const mails = feedDocument.querySelectorAll('entry')
  const currentDate = Date.now()

  for (const mail of mails) {
    const link = mail.querySelector('link')!.getAttribute('href')!
    const messageId = new URLSearchParams(link).get('message_id')!

    if (previousNewMails.has(messageId)) {
      continue
    }

    const issuedDate = getDateBySelector(mail, 'issued')

    if (currentDate - issuedDate < 60000) {
      previousNewMails.add(messageId)

      const newMail = {
        messageId,
        link,
        subject: getContentBySelector(mail, 'title'),
        summary: getContentBySelector(mail, 'summary').trim(),
        sender: {
          name: getContentBySelector(mail, 'name'),
          email: getContentBySelector(mail, 'email')
        }
      }

      newMails.push(newMail)
    }
  }

  return newMails
}

function clickElement(selector: string) {
  const element = document.querySelector<HTMLDivElement>(selector)
  if (element) {
    element.click()
  }
}

export function initGmail() {
  console.log('[Gmail Desktop] Initializing Gmail integration...')
  
  void (async () => {
    // Request notification permission if not already granted
    console.log('[Gmail Desktop] Current notification permission:', Notification.permission)
    
    if (Notification.permission !== 'granted') {
      try {
        console.log('[Gmail Desktop] Requesting notification permission...')
        const permission = await Notification.requestPermission()
        console.log('[Gmail Desktop] Notification permission result:', permission)
      } catch (error: unknown) {
        console.error('[Gmail Desktop] Failed to request notification permission:', error)
      }
    }

    await observeUnreadInbox()

    ipcRenderer.on('gmail:archive-mail', async (_event, mailId: string) => {
      await sendMailAction(mailId, 'archive')
      refreshInbox()
    })

    ipcRenderer.on('gmail:mark-as-read', async (_event, mailId: string) => {
      await sendMailAction(mailId, 'markAsRead')
      refreshInbox()
    })

    ipcRenderer.on('gmail:delete-mail', async (_event, mailId: string) => {
      await sendMailAction(mailId, 'delete')
      refreshInbox()
    })

    ipcRenderer.on('gmail:mark-as-spam', async (_event, mailId: string) => {
      await sendMailAction(mailId, 'markAsSpam')
      refreshInbox()
    })

    ipcRenderer.on('gmail:go-to', (_event, destination: string) => {
      switch (destination) {
        case 'inbox':
        case 'starred':
        case 'snoozed':
        case 'sent':
        case 'drafts':
        case 'imp':
        case 'scheduled':
        case 'all':
        case 'settings':
          window.location.hash = `#${destination}`
          break
        default:
      }
    })

    ipcRenderer.on(
      'gmail:open-mail',
      (_event: IpcRendererEvent, messageId: string) => {
        window.location.hash = `#inbox/${messageId}`
      }
    )

    ipcRenderer.on('gmail:compose-mail', async (_event, to?: string) => {
      clickElement('div[gh="cm"]')

      if (!to) {
        return
      }

      const toElement = await elementReady<HTMLTextAreaElement>(
        'textarea[name="to"]',
        {
          stopOnDomReady: false,
          timeout: 60000
        }
      )

      if (!toElement) {
        return
      }

      toElement.focus()
      toElement.value = to

      const subjectElement = document.querySelector<HTMLInputElement>(
        'input[name="subjectbox"]'
      )

      if (!subjectElement) {
        return
      }

      // The subject input can't be focused immediately after
      // settings the "to" input value for an unknown reason.
      setTimeout(() => {
        subjectElement.focus()
      }, 200)
    })

    setInterval(() => {
      previousNewMails.clear()
    }, 1000 * 60 * 30)
  })()

  window.addEventListener('unload', () => {
    unreadCountObserver?.disconnect()
    unreadCountObserver = undefined

    actionToken = undefined
    inboxParentElement = undefined
    previousUnreadCount = undefined
    isInitialNewMailsFetch = true
    feedVersion = 0
    previousModifiedFeedDate = 0
    currentModifiedFeedDate = 0
    previousNewMails = new Set()
  })
}
