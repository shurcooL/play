package svg_test

import (
	"fmt"

	"github.com/shurcooL/play/175/svg"
)

func Example() {
	fmt.Println(svg.Render("plus"))

	// Output:
	// <svg aria-hidden="true" class="octicon octicon-plus" width="12" height="16" role="img" version="1.1" viewBox="0 0 12 16">
	// 	<path d="M12 9H7v5H5V9H0V7h5V2h2v5h5v2z"></path>
	// </svg>
}
