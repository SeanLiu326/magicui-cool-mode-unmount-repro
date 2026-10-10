# Magic UI CoolMode — unmount-during-hold leak (reproduction)

Deterministic reproduction for: [`CoolMode`](https://magicui.design/docs/components/cool-mode) keeps generating particles after it unmounts during an active mouse/touch hold. The cleanup removes the hold-end event listeners but never disables particle generation (`autoAddParticle`), so the `requestAnimationFrame` loop keeps adding particles while the 500 ms polling interval waits for the particle array to become empty. The animation loop, the polling timer, and the shared `#_coolMode_effect` overlay stay alive until the page reloads.

Reported against `magicuidesign/magicui` `main` @ `cdb348cb4c72a9b54b554d8617801e479fbc8714`.

## Requirements

- Node 22+
- A local checkout of `magicuidesign/magicui` at `main`

## Run

```bash
npm install
MAGICUI_REPO=/absolute/path/to/magicui npm test           # core cases
MAGICUI_REPO=/absolute/path/to/magicui npm run test:extra # edge cases
```

Expected on the current `main` @ `cdb348c`:

| Suite | Result |
| --- | --- |
| `repro.test.ts` | 2 failed, 2 passed — the failures are the two unmount-during-hold cases (`1 particle becomes 6`; after 10 simulated seconds: 1 pending animation callback, 1 polling timer, overlay present) |
| `extra.test.ts` | 2 failed — replacing `options` during an active hold leaks the replaced effect (its rAF loop and poll never finish); with two instances, unmounting one during a hold keeps it generating and the shared overlay is never removed |

On the fixed component (disable particle generation at the start of cleanup), all 6 cases pass.

## Notes

- Real React component (imported from the checkout) + `react-test-renderer`; real JSDOM DOM and events; controlled `requestAnimationFrame` queue; fake timers; fixed `Math.random`. No effect logic is copied into the tests.
- The `react-test-renderer` deprecation warning printed by React is expected and is not a failure cause.
- No real-browser run or CPU benchmark is claimed.

## Manual browser recipe

Mount `CoolMode` around a button that removes itself shortly after a hold starts; the overlay keeps emitting particles after the button is gone:

```tsx
"use client"

import { useState } from "react"
import { CoolMode } from "@/components/ui/cool-mode"

export default function Repro() {
  const [visible, setVisible] = useState(true)
  const dismissSoon = () => setTimeout(() => setVisible(false), 100)

  return visible ? (
    <CoolMode>
      <button type="button" onMouseDown={dismissSoon} onTouchStart={dismissSoon}>
        Hold until this button disappears
      </button>
    </CoolMode>
  ) : <p>CoolMode has unmounted.</p>
}
```
