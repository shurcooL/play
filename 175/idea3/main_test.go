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
func Example() {
	n := css.DeclarationBlock{
		cd.BackgroundColor{cv.RGB{128, 128, 128}},
		cd.FontSize{cv.Px(24)},
	}

	fmt.Println(css.Render(n))

	// Output:
	// {
	// 	background-color: rgb(128, 128, 128);
	// 	font-size: 24px;
	// }
}
