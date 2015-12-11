// Tools to help with creating font texture maps.
package main

import (
	"fmt"
	"image"
	"os"

	"image/color"
	"image/png"

	"github.com/bradfitz/iter"
	"github.com/shurcooL/go-goon"
)

func main() {
	//printCharacters()
	dumpMarks()
	//convertToAlphaTexture()
}

func convertToAlphaTexture() {
	f, err := os.Open("/Users/Dmitri/Dropbox/Work/2015/Bitmap Fonts/Menlo 1.png")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	m, _, err := image.Decode(f)
	if err != nil {
		panic(err)
	}

	/*m2 := image.NewNRGBA(m.Bounds())
	c2 := color.NRGBA{R: 255, G: 255, B: 255}

	for y := range iter.N(m.Bounds().Dy()) {
		for x := range iter.N(m.Bounds().Dx()) {
			c := m.At(x, y).(color.RGBA)
			c2.A = 255 - uint8((float64(c.R)+float64(c.G)+float64(c.B))/3.0+0.5)
			m2.SetNRGBA(x, y, c2)
		}
	}*/

	m2 := image.NewGray(m.Bounds())
	c2 := color.Gray{}

	for y := range iter.N(m.Bounds().Dy()) {
		for x := range iter.N(m.Bounds().Dx()) {
			c := m.At(x, y).(color.RGBA)
			if c.A != 255 {
				panic(fmt.Sprintln(x, y, c.A))
			}
			c2.Y = 255 - uint8((float64(c.R)+float64(c.G)+float64(c.B))/3.0+0.5)
			m2.SetGray(x, y, c2)
		}
	}

	w, err := os.OpenFile("/Users/Dmitri/Dropbox/Work/2015/Bitmap Fonts/Menlo.png", os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		panic(err)
	}
	defer w.Close()

	//err = (&png.Encoder{CompressionLevel: png.NoCompression}).Encode(w, m2)
	err = png.Encode(w, m2)
	if err != nil {
		panic(err)
	}
}

func dumpMarks() {
	f, err := os.Open("/Users/Dmitri/Dropbox/Work/2015/Bitmap Fonts/Helvetica Neue 2.png")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	m, _, err := image.Decode(f)
	if err != nil {
		panic(err)
	}

	goon.Dump(m.Bounds())
	//goon.Dump(m.At(0, 0))

	dx := m.Bounds().Dx()

	var marks [6][17]float64 // Row -> 17 positions in range [0, 1].

	for row := range iter.N(6) {
		i := 1
		for x := 1; x < dx; x++ {
			y := 150 * row
			c := m.At(x, y)
			if c.(color.RGBA) == (color.RGBA{R: 255, G: 255, B: 255, A: 255}) {
				continue
			}

			marks[row][i] = float64(x+1) / float64(dx)
			i++
			x++ // Skip the 2nd black pixel.
		}
	}

	//goon.DumpExpr(marks)
	fmt.Printf("var marks = %#v\n", marks)
}

func printCharacters() {
	var r rune = 32
	for range iter.N(6) {
		for range iter.N(16) {
			fmt.Print(string(r))
			r++
			if r >= 127 {
				break
			}
		}
		fmt.Println()
	}
}
