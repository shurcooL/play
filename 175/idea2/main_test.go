package a

import (
	"fmt"

	"github.com/shurcooL/play/175/idea2/css"
)

func ExampleSize() {
	n := css.Px(24)

	fmt.Println(n.CSS())

	// Output:
	// 24px
}

func ExampleFontSize() {
	n := css.FontSize{css.Px(24)}

	fmt.Println(n.CSS())

	// Output:
	// font-size: 24px;
}

func ExampleColor() {
	n := css.RGB{128, 128, 128}

	fmt.Println(n.CSS())

	// Output:
	// rgb(128, 128, 128)
}

func ExampleBackgroundColor() {
	n := css.BackgroundColor{css.RGB{128, 128, 128}}

	fmt.Println(n.CSS())

	// Output:
	// background-color: rgb(128, 128, 128);
}

/*
	.gray {
		background-color: rgb(128, 128, 128);
		font-size: 24px;
	}
*/
func Example() {
	var n = struct {
		css.BackgroundColor
		css.FontSize
	}{
		BackgroundColor: css.BackgroundColor{css.RGB{128, 128, 128}},
		FontSize:        css.FontSize{css.Px(24)},
	}

	fmt.Println(css.Render(n))

	// Output:
	// {
	// 	background-color: rgb(128, 128, 128);
	// 	font-size: 24px;
	// }
}
