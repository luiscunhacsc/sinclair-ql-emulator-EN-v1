export const COMPUTER_FRAME_ASSETS = Object.freeze({
  empty: "./assets/compositions/qlwithmonitor.png",
  mdv1: "./assets/compositions/qlwithmonitor-mdv1.png",
  mdv2: "./assets/compositions/qlwithmonitor-mdv2.png",
  both: "./assets/compositions/qlwithmonitor-mdv1-mdv2.png",
});

export function computerFrameSource(mdv1Mounted, mdv2Mounted) {
  if (mdv1Mounted && mdv2Mounted) return COMPUTER_FRAME_ASSETS.both;
  if (mdv1Mounted) return COMPUTER_FRAME_ASSETS.mdv1;
  if (mdv2Mounted) return COMPUTER_FRAME_ASSETS.mdv2;
  return COMPUTER_FRAME_ASSETS.empty;
}
