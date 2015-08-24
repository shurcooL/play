// Play with mathgl matrix String methods.
package main

import (
	"fmt"

	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
)

func main() {
	{
		var m1 = mgl32.Mat4x2{1, 2, 3, 4, 5, 6, 7, 8}
		var m2 = mgl32.Mat2x4{1, 2, 3, 4, 5, 6, 7, 8}

		fmt.Println(m1.String())
		fmt.Println(m2.String())
	}

	{
		var m1 = mgl64.Mat4x2{1, 2, 3, 4, 5, 6, 7, 8}
		var m2 = mgl64.Mat2x4{1, 2, 3, 4, 5, 6, 7, 8}

		fmt.Println(m1.String())
		fmt.Println(m2.String())
	}
}
