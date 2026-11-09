# Target Shooter

Single-player 3D shooter for phones: TypeScript + Three.js. No camera / no XR — you stand in a virtual
arena, look around with the phone's gyroscope (or drag on desktop), and tap to shoot.

## Run
```bash
npm install
npm run dev        # https://<LAN-IP>:5173 (self-signed cert: accept the warning once)
```
Gyroscope access needs HTTPS (provided by the dev server and by Vercel/Netlify).

## Production / offline
```bash
npm run build && npm run preview     # https://<LAN-IP>:4173
```
The service worker (`public/sw.js`) is only registered in production builds. After the first load the
game opens instantly and works offline.

## Custom background
Put an equirectangular (360°) image at `public/background/sky.jpg` (2048×1024, under ~500 KB).
If absent, a procedural night sky is used.

## Structure
- `core/` – `GameEngine` (composition root + loop), `LookControls` (gyro/drag), `EventBus`, `Disposables`
- `components/` – `Target`, `Weapon`, `Environment` (sky + ground)
- `managers/` – `StateManager`, `InputManager`, `CollisionManager`, `TargetManager`, `AudioManager`
- `ui/` – `HUD`, `StartScreen`
