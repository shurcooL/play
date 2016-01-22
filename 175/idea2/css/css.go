package css

import (
	"fmt"
	"reflect"
)

// CSS ...
type CSS interface {
	CSS() string
}

// Size ...
type Size interface {
	CSS
}

// Px ...
type Px int

func (s Px) CSS() string {
	return fmt.Sprint(s, "px")
}

// FontSize ...
type FontSize struct {
	Size
}

func (fs FontSize) CSS() string {
	return fmt.Sprint("font-size: ", fs.Size.CSS(), ";")
}

// Color ...
type Color interface {
	CSS
}

//func RGB(r, g, b int) Color {}

type RGB struct {
	R, G, B int
}

func (c RGB) CSS() string {
	return fmt.Sprintf("rgb(%v, %v, %v)", c.R, c.G, c.B)
}

// BackgroundColor ...
type BackgroundColor struct {
	Color
}

func (bc BackgroundColor) CSS() string {
	return fmt.Sprint("background-color: ", bc.Color.CSS(), ";")
}

// Render ...
func Render(n interface{}) string {
	out := "{\n"
	v := reflect.ValueOf(n)
	if v.Kind() != reflect.Struct {
		panic("not struct")
	}
	for i := 0; i < v.NumField(); i++ {
		f := v.Field(i)
		out += "\t" + f.Interface().(CSS).CSS() + "\n"
	}
	out += "}\n"
	return out
}
