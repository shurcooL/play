// Play with rendering a TrueType font.
package main

import (
	"bytes"
	"image"
	"image/png"
	"io/ioutil"
	"log"

	"github.com/golang/freetype/truetype"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/math/fixed"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	//f, err := sfnt.Parse(goregular.TTF)
	//if err != nil {
	//	return err
	//}
	//face, err := opentype.NewFace(f, nil)
	//if err != nil {
	//	return err
	//}
	f, err := truetype.Parse(goregular.TTF)
	if err != nil {
		return err
	}
	face := truetype.NewFace(f, &truetype.Options{
		Size: 300,
		//DPI:  144,
		//Hinting: font.HintingVertical,
	})

	m := image.NewNRGBA(image.Rect(0, 0, 1000, 1000))

	fd := font.Drawer{
		Dst:  m,
		Src:  image.Black,
		Face: face,
		Dot:  fixed.P(100, 900),
	}
	fd.DrawString("Hello.")

	var buf bytes.Buffer
	err = png.Encode(&buf, m)
	if err != nil {
		return err
	}
	err = ioutil.WriteFile("/Users/Dmitri/Desktop/out.png", buf.Bytes(), 0600)
	return err
}
