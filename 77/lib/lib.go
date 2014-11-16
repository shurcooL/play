package lib

func Foo() interface{} {
	unexportedFuncStruct := struct {
		unexportedFunc func() string
	}{func() string { return "This is the source of an unexported struct field." }}

	return unexportedFuncStruct
}
