package css

import "github.com/shurcooL/play/175/idea3/cv"

// DeclarationBlock is a CSS declaration block.
type DeclarationBlock []Declaration

// Declaration is a CSS declaration.
type Declaration cv.CSS

// Render ...
func Render(db DeclarationBlock) string {
	s := "{\n"
	for _, d := range db {
		s += "\t" + d.CSS() + "\n"
	}
	s += "}\n"
	return s
}
