/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
declare module '@jamescoyle/vue-icon' {
  import type { DefineComponent } from 'vue'
  // type	null	This sets the size and viewbox to match the recommended size for the icon pack specified.
  // path	null	Required. An SVG path to render as an icon
  // size	24	The width and height of the SVG element
  // viewbox	"0 0 24 24"	The viewBox of the SVG element
  // flip	null	One of "horizontal", "vertical", or "both". Flips the icon in the specified direction(s).
  // rotate	0deg	Rotates the icon by the specified value. Can be any valid CSS angle value.
  const SvgIcon: DefineComponent<{}, {}, any>
  export default SvgIcon
}
