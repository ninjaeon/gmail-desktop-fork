export const appRegionDragStyle: React.CSSProperties = {
  WebkitAppRegion: 'drag',
  WebkitUserSelect: 'none'
}

export const appRegionNoDragStyle: React.CSSProperties = {
  WebkitAppRegion: 'no-drag',
  WebkitUserSelect: 'initial'
}

export const isMacOS = window.navigator.platform.includes('Mac')
