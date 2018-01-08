// Play with rendering a TrueType font to a CanvasRenderingContext2D (in browser).
package main

import (
	"fmt"
	"image"
	"log"

	"github.com/golang/freetype/truetype"
	"github.com/gopherjs/gopherjs/js"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/math/fixed"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
		var (
			canvas        = document.GetElementByID("canvas").(*dom.HTMLCanvasElement)
			width, height = dom.GetWindow().InnerWidth(), dom.GetWindow().InnerHeight()
			dpr           = js.Global.Get("devicePixelRatio").Float()
		)
		canvas.Width = int(float64(width)*dpr + 0.5)   // Nearest non-negative int.
		canvas.Height = int(float64(height)*dpr + 0.5) // Nearest non-negative int.
		canvas.Style().SetProperty("width", fmt.Sprintf("%vpx", width), "")
		canvas.Style().SetProperty("height", fmt.Sprintf("%vpx", height), "")

		err := paint(canvas.GetContext2d(), canvas.Width, canvas.Height, int(dpr))
		if err != nil {
			log.Println(err)
		}
	})
}

func paint(ctx *dom.CanvasRenderingContext2D, width, height, scale int) error {
	// Load font from TTF data.
	f, err := truetype.Parse(goregular.TTF)
	if err != nil {
		return err
	}
	face := truetype.NewFace(f, &truetype.Options{
		Size: 300,
		DPI:  72 * float64(scale),
		//Hinting: font.HintingVertical,
	})

	m := ctx.CreateImageData(width, height)

	// Draw text on image.
	fd := font.Drawer{
		Dst:  m,
		Src:  image.Black,
		Face: face,
		Dot:  fixed.P(100*scale, height-100*scale),
	}
	fd.DrawString("Hello.")

	// Output image to a context.
	ctx.PutImageData(m, 0, 0)
	return nil
}
