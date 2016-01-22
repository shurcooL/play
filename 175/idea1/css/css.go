package css

import "image/color"

type Style struct {
	BackgroundColor color.Color
	FontSize        interface {
		Px() int
	}
}
