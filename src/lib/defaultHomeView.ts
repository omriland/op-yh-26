export function defaultHomeView(input: {
  manages: boolean
  hasMineList: boolean
  isAdmin: boolean
}): 'events' | 'mine' | 'users' | 'profile' {
  if (input.manages) return 'events'
  if (input.hasMineList) return 'mine'
  if (input.isAdmin) return 'users'
  return 'profile'
}
