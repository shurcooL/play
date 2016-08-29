// Package cv defines CSS values.
package cv

import "fmt"

// CSS ...
type CSS interface {
	CSS() string
}

// Size is a CSS value describing size.
type Size interface {
	CSS
}

// Px ...
type Px uint

func (s Px) CSS() string {
	return fmt.Sprint(s, "px")
}

// Color is a CSS value describing color.
type Color interface {
	CSS
}

type RGB struct {
	R, G, B uint8
}

func (c RGB) CSS() string {
	return fmt.Sprintf("rgb(%v, %v, %v)", c.R, c.G, c.B)
}

type Hex struct {
	RGB uint32
}

func (c Hex) CSS() string {
	return fmt.Sprintf("#%x", c.RGB)
}

// Display is a CSS value describing display.
type Display string

const (
	InlineBlock Display = "inline-block"
)

func (d Display) CSS() string {
	return string(d)
}

// FontFamily is a CSS value describing font family.
type FontFamily string

const (
	SansSerif FontFamily = "sans-serif"
)

func (ff FontFamily) CSS() string {
	return string(ff)
}
