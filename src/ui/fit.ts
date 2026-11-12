import type Phaser from 'phaser';

/**
 * Menus are laid out in a fixed 540x960 "design space" and then scaled + centered to fit
 * whatever the screen is (portrait phone, landscape desktop, wide phone...).
 */
export function designFit(scene: Phaser.Scene) {
  const cam = scene.cameras.main;
  const W = cam.width / cam.zoom, H = cam.height / cam.zoom; // logical size (camera is zoomed for crisp rendering)
  const k = Math.min(W / 540, H / 960);
  const ox = W / 2 - 270 * k, oy = H / 2 - 480 * k;
  return {
    k, W, H,
    /** Map an object created at design coords to the screen (position + scale). */
    place<T extends Phaser.GameObjects.GameObject>(o: T): T {
      const t = o as unknown as { x: number; y: number; scaleX: number; scaleY: number; setScale(x: number, y?: number): void };
      t.x = ox + t.x * k;
      t.y = oy + t.y * k;
      t.setScale(t.scaleX * k, t.scaleY * k);
      return o;
    },
  };
}
