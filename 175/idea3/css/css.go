package css

import (
	"reflect"

	"github.com/shurcooL/play/175/idea3/cv"
)

// Render ...
func Render0(n interface{}) string {
	out := "{\n"
	v := reflect.ValueOf(n)
	if v.Kind() != reflect.Struct {
		panic("not struct")
	}
	for i := 0; i < v.NumField(); i++ {
		f := v.Field(i)
		out += "\t" + f.Interface().(cv.CSS).CSS() + "\n"
	}
	out += "}\n"
	return out
}

type DeclarationBlock []Declaration

type Declaration cv.CSS

// Render ...
func Render1(db DeclarationBlock) string {
	out := "{\n"
	for _, d := range db {
		out += "\t" + d.CSS() + "\n"
	}
	out += "}\n"
	return out
}
