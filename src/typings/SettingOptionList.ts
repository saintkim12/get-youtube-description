
interface SettingOption {
  name: string,
  label: string,
  valueType: StringConstructor | BooleanConstructor,
  values: ({ text: any, value: string | boolean })[]
}
