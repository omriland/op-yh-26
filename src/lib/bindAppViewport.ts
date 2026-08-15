import { bindAppViewportHeight } from './appViewport'

/** Side-effect entry: run before App so a failed env boot still locks the viewport. */
bindAppViewportHeight()
