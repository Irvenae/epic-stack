import  { type Meta, type StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { StatusButton } from './status-button'

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'components/Status Button',
  component: StatusButton,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  args: { onClick: fn() },
  tags: ['autodocs'],
} satisfies Meta<typeof StatusButton>

export default meta
type Story = StoryObj<typeof meta>

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Primary: Story = {
  args: {
    status: 'pending',
    children: 'status',
  },
}
