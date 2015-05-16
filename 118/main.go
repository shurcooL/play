// Play with resizing an image via NearestNeighbor.
package main

import (
	"fmt"
	"image"
	"image/png"
	"log"
	"os"

	"golang.org/x/image/draw"
)

func main() {
	fSrc, err := os.Open("./in.png")
	if err != nil {
		log.Fatal(err)
	}
	defer fSrc.Close()
	src, _, err := image.Decode(fSrc)
	if err != nil {
		log.Fatal(err)
	}

	resize := func(r image.Rectangle) image.Rectangle {
		r.Max = r.Max.Div(2)
		return r
	}
	dst := image.NewNRGBA(resize(src.Bounds()))

	fmt.Println(src.Bounds(), "->", dst.Bounds())

	draw.NearestNeighbor.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)

	if true {
		fDst, err := os.Create("./out.png")
		if err != nil {
			log.Fatal(err)
		}
		defer fDst.Close()
		err = png.Encode(fDst, dst)
		if err != nil {
			log.Fatal(err)
		}
	}
}
