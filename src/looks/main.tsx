import '@fontsource-variable/m-plus-1'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Looks } from './Looks'
import { SIGN_FONT } from './signs'

// Sign faces are drawn on canvases, so the font has to be in before the first frame.
document.fonts.load(`800 64px ${SIGN_FONT}`, '六本木カラオケ').finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Looks />
    </StrictMode>,
  )
})
