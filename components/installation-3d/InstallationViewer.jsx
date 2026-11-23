'use client';

import dynamic from 'next/dynamic';

// WebGL + leva are browser-only, so skip server prerendering for the scene
const InstallationScene = dynamic(() => import('./InstallationScene'), { ssr: false });

export default function InstallationViewer(props) {
  return <InstallationScene {...props} />;
}
