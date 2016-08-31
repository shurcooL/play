// Package cd defines CSS declarations of CSS properties.
package cd

import (
	"fmt"

	"github.com/shurcooL/play/175/idea3/cv"
)

// Color is a CSS declaration of CSS property "color".
type Color struct {
	cv.Color
}

func (c Color) CSS() string {
	return fmt.Sprint("color: ", c.Color.CSS(), ";")
}

// Fill is a CSS declaration of CSS property "fill".
type Fill struct {
	cv.Color
}

func (s Fill) CSS() string {
	return fmt.Sprint("fill: ", s.Color.CSS(), ";")
}

// BackgroundColor is a CSS declaration of CSS property "background-color".
type BackgroundColor struct {
	cv.Color
}

func (bc BackgroundColor) CSS() string {
	return fmt.Sprint("background-color: ", bc.Color.CSS(), ";")
}

// FontSize is a CSS declaration of CSS property "font-size".
type FontSize struct {
	cv.Size
}

func (fs FontSize) CSS() string {
	return fmt.Sprint("font-size: ", fs.Size.CSS(), ";")
}

// LineHeight is a CSS declaration of CSS property "line-height".
type LineHeight struct {
	cv.Size
}

func (lh LineHeight) CSS() string {
	return fmt.Sprint("line-height: ", lh.Size.CSS(), ";")
}

// Display is a CSS declaration of CSS property "display".
type Display struct {
	cv.Display
}

func (d Display) CSS() string {
	return fmt.Sprint("display: ", d.Display.CSS(), ";")
}

// VerticalAlign is a CSS declaration of CSS property "vertical-align".
type VerticalAlign struct {
	cv.VerticalAlign
}

func (va VerticalAlign) CSS() string {
	return fmt.Sprint("vertical-align: ", va.VerticalAlign.CSS(), ";")
}

// FontFamily is a CSS declaration of CSS property "font-family".
type FontFamily struct {
	cv.FontFamily
}

func (ff FontFamily) CSS() string {
	return fmt.Sprint("font-family: ", ff.FontFamily.CSS(), ";")
}

// Padding is a CSS declaration of CSS property "padding".
type Padding struct {
	// TODO: These should be factored into CSS values. Multiple ways of defining padding, which is 4 sizes.
	Size0 cv.Size
	Size1 cv.Size
}

func (p Padding) CSS() string {
	return fmt.Sprintf("padding: %v %v;", p.Size0.CSS(), p.Size1.CSS())
}

// BorderRadius is a CSS declaration of CSS property "border-radius".
type BorderRadius struct {
	cv.Size
}

func (br BorderRadius) CSS() string {
	return fmt.Sprint("border-radius: ", br.Size.CSS(), ";")
}
