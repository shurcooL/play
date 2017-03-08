// Decode a 2x1 png image and dump its pixel colors.
package main

import (
	"image"
	"image/png"
	"log"
	"os"

	"github.com/shurcooL/go-goon"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	img, err := openImage()
	if err != nil {
		return err
	}
	goon.DumpExpr(img.Bounds())
	goon.DumpExpr(img.At(0, 0))
	goon.DumpExpr(img.At(1, 0))
	return nil
}

func openImage() (image.Image, error) {
	f, err := os.Open("/Users/Dmitri/Desktop/Screen Shot 2017-03-06 at 4.12.16 AM.png")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}
