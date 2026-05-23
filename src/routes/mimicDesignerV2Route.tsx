import React from 'react';
import { MimicDesignerV2 } from '../mimic-designer-v2/ui/MimicDesignerV2';

export const mimicDesignerV2Route = {
  path: '/mimic-designer-v2',
  featureFlag: 'mimicDesignerV2Enabled',
  element: <MimicDesignerV2 />
};
