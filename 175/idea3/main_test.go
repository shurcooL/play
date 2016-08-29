package a

import (
	"fmt"

	"github.com/shurcooL/play/175/idea3/cd"
	"github.com/shurcooL/play/175/idea3/css"
	"github.com/shurcooL/play/175/idea3/cv"
)

/*
Resources:

-	https://en.wikipedia.org/wiki/Cascading_Style_Sheets#Declaration_block
*/

/*
	.gray {
		background-color: rgb(128, 128, 128);
		font-size: 24px;
	}
*/
func Example0() {
	var n = struct {
		cd.BackgroundColor
		cd.FontSize
	}{
		cd.BackgroundColor{cv.RGB{128, 128, 128}},
		cd.FontSize{cv.Px(24)},
	}

	fmt.Println(css.Render0(n))

	// Output:
	// {
	// 	background-color: rgb(128, 128, 128);
	// 	font-size: 24px;
	// }
}
func Example1() {
	var n struct {
		cd.BackgroundColor
		cd.FontSize
	}
	n.BackgroundColor.Color = cv.RGB{128, 128, 128}
	n.FontSize.Size = cv.Px(24)

	fmt.Println(css.Render0(n))

	// Output:
	// {
	// 	background-color: rgb(128, 128, 128);
	// 	font-size: 24px;
	// }
}
func Example2() {
	var n = css.DeclarationBlock{
		cd.BackgroundColor{cv.RGB{128, 128, 128}},
		cd.FontSize{cv.Px(24)},
	}

	fmt.Println(css.Render1(n))

	// Output:
	// {
	// 	background-color: rgb(128, 128, 128);
	// 	font-size: 24px;
	// }
}
