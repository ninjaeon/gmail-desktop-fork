import { useEffect, useState } from 'react'
import { useColorMode } from '@chakra-ui/react'
import { isMacOS } from './helpers'
import ipc from './ipc'
import { Account, UnreadCounts, AppUpdateInfo, AppUpdateStatus } from '../types'
import { Except } from 'type-fest'

export function useDarkMode() {
  const { setColorMode } = useColorMode()

  useEffect(() => {
    ipc.invoke('init-dark-mode').then(({ enabled }: { enabled: boolean }) => {
      setColorMode(enabled ? 'dark' : 'light')
    })
    ipc.on('dark-mode-updated', (enabled: boolean) => {
      setColorMode(enabled ? 'dark' : 'light')
    })
  }, [])
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({})

  useEffect(() => {
    ipc.invoke('get-accounts').then(setAccounts)

    ipc.on('accounts-updated', (updatedAccounts: Account[]) => {
      setAccounts(updatedAccounts)
    })

    ipc.on('unread-counts-updated', (updatedUnreadCounts: UnreadCounts) => {
      setUnreadCounts(updatedUnreadCounts)
    })
  }, [])

  const selectAccount = (accountId: string) => {
    ipc.send('select-account', accountId)
  }

  return {
    accounts: accounts.map((account) => ({
      ...account,
      unreadCount: unreadCounts[account.id]
    })),
    selectAccount
  }
}

export function useAddAccount() {
  const [isAddingAccount, setIsAddingAccount] = useState(false)

  useEffect(() => {
    ipc.on('add-account-request', () => {
      setIsAddingAccount(true)
    })
  }, [])

  const addAccount = (account: Except<Account, 'selected'>) => {
    ipc.send('add-account', account)
    setIsAddingAccount(false)
  }

  const cancelAddAccount = () => {
    ipc.send('add-account-cancel')
    setIsAddingAccount(false)
  }

  return { isAddingAccount, addAccount, cancelAddAccount }
}

export function useEditAccount() {
  const [editingAccount, setEditingAccount] = useState<Account>()

  useEffect(() => {
    ipc.on('edit-account-request', (account: Account) => {
      setEditingAccount(account)
    })
  }, [])

  const saveEditAccount = (account: Except<Account, 'selected'>) => {
    ipc.send('edit-account-save', account)
    setEditingAccount(undefined)
  }

  const cancelEditAccount = () => {
    ipc.send('edit-account-cancel')
    setEditingAccount(undefined)
  }

  const removeAccount = (accountId: string) => {
    ipc.send('remove-account', accountId)
    setEditingAccount(undefined)
  }

  return {
    isEditingAccount: Boolean(editingAccount),
    editingAccount,
    saveEditAccount,
    cancelEditAccount,
    removeAccount
  }
}

export function useAppUpdate() {
  const [updateStatus, setUpdateStatus] = useState<
    AppUpdateStatus | undefined
  >()
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | undefined>()
  const [updateDownloadPercent, setUpdateDownloadPercent] = useState(0)
  const [isReleaseNotesVisible, setIsReleaseNotesVisible] = useState(false)

  useEffect(() => {
    ipc.on('updater:available', (updateInfo) => {
      setUpdateInfo(updateInfo)
      setUpdateStatus('available')
    })

    ipc.on('updater:download-progress', (downloadPercent) => {
      setUpdateDownloadPercent(downloadPercent)
    })

    ipc.on('updater:install', () => {
      setUpdateStatus('install')
    })
  }, [])

  const resetStates = () => {
    setUpdateStatus(undefined)
    setUpdateInfo(undefined)
    setUpdateDownloadPercent(0)
    setIsReleaseNotesVisible(false)
  }

  return {
    updateStatus,
    updateInfo,
    updateDownloadPercent,
    downloadUpdate: () => {
      ipc.send('updater:download')
      setUpdateStatus('downloading')
    },
    installUpdate: () => {
      ipc.send('updater:install')
    },
    dismissUpdate: () => {
      ipc.send('updater:dismiss')
      resetStates()
    },
    cancelUpdateDownload: () => {
      ipc.send('updater:cancel-download')
      resetStates()
    },
    toggleReleaseNotes: (visible: boolean) => {
      ipc.send('updater:toggle-release-notes', visible)
      setIsReleaseNotesVisible(visible)
    },
    isReleaseNotesVisible,
    skipUpdateVersion: (version: string) => {
      ipc.send('updater:skip-version', version)
      resetStates()
    }
  }
}

export function useTitleBar() {
  const [isTitleBarEnabled, setIsTitleBarEnabled] = useState(!isMacOS)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)

  useEffect(() => {
    if (!isMacOS) {
      ipc.invoke('title-bar:is-enabled').then(setIsTitleBarEnabled)

      ipc.invoke('window:is-maximized').then(setIsWindowMaximized)

      ipc.on('window:maximized', () => {
        setIsWindowMaximized(true)
      })

      ipc.on('window:unmaximized', () => {
        setIsWindowMaximized(false)
      })
    }
  }, [])

  return {
    isTitleBarEnabled,
    isWindowMaximized,
    openAppMenu: () => {
      ipc.send('title-bar:open-app-menu')
    },
    minimzeWindow: () => {
      ipc.send('window:minimize')
    },
    maximizeWindow: () => {
      ipc.send('window:maximize')
    },
    unmaximizeWindow: () => {
      ipc.send('window:unmaximize')
    },
    closeWindow: () => {
      ipc.send('window:close')
    }
  }
}
