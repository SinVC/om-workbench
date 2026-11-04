import React from 'react';

export interface WorkbenchTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  render: () => React.ReactNode;
}
