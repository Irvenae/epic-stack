import type { Meta } from '@storybook/react'
import { Button, type ButtonProps } from './button.tsx'
import { fn } from '@storybook/test'

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'components/Button',
  component: Button,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  args: { onClick: fn() },
  argTypes: {
    asChild: {
      type: 'boolean',
      description: 'Delegate the rendering of a component to child element'
    }
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;

export function Primary(buttonProps: ButtonProps) {
  return (<Button {...buttonProps}>
    <p className="hover:underline">
     Back to top
    </p> 
    </Button>)
}
