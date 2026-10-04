export default defineAppConfig({
  ui: {
    colors: { primary: 'amber', neutral: 'zinc' },
    card: {
      slots: { root: 'rounded-xl' },
      variants: { variant: { outline: { root: 'bg-elevated' } } },
    },
  },
})
