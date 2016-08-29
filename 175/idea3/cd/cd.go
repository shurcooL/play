// Package cd defines CSS declarations of CSS properties.
package cd

import (
	"fmt"

	"github.com/shurcooL/play/175/idea3/cv"
)

// BackgroundColor is a CSS declarations of CSS property "background-color".
type BackgroundColor struct {
	cv.Color
}

func (bc BackgroundColor) CSS() string {
	return fmt.Sprint("background-color: ", bc.Color.CSS(), ";")
}

// FontSize is a CSS declarations of CSS property "font-size".
type FontSize struct {
	cv.Size
}

func (fs FontSize) CSS() string {
	return fmt.Sprint("font-size: ", fs.Size.CSS(), ";")
}
