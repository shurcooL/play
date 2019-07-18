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
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/font/sfnt"
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
	var face font.Face
	switch 0 {
	case 0:
		f, err := truetype.Parse(goregular.TTF)
		if err != nil {
			return err
		}
		face = truetype.NewFace(f, &truetype.Options{
			Size: 300,
			DPI:  72 * float64(scale),
			//Hinting: font.HintingVertical,
		})
	case 1:
		f, err := sfnt.Parse(goregular.TTF)
		if err != nil {
			return err
		}
		face, err = opentype.NewFace(f, nil)
		if err != nil {
			return err
		}
	}

	m := ctx.CreateImageData(width, height)

	// Draw text on image.
	fd := font.Drawer{
		Dst:  m,
		Src:  image.Black,
		Face: DebugFace{face},
		Dot:  fixed.P(100*scale, height-100*scale),
	}
	fd.DrawString(fmt.Sprintf("Hello. @%dx Can you read this? This is some text that is kinda hard to read because it's small, but it's still important.", scale))

	// Output image to a context.
	ctx.PutImageData(m, 0, 0)
	return nil
}

type DebugFace struct {
	font.Face
}

func (df DebugFace) Glyph(dot fixed.Point26_6, r rune) (dr image.Rectangle, mask image.Image, maskp image.Point, advance fixed.Int26_6, ok bool) {
	fmt.Println("Glyph:", dot, r)
	dr, mask, maskp, advance, ok = df.Face.Glyph(dot, r)
	if r == 'H' {
		fmt.Println("dr:", dr)
		fmt.Println("mask:", mask.Bounds(), mask.ColorModel())
		fmt.Println("maskp:", maskp)
		fmt.Println("advance:", advance)
		fmt.Println("ok:", ok)
	}
	return dr, mask, maskp, advance, ok
}
