package issue4449

// This is sample godoc documentation with indented (by one tab) partial Go code, including a raw string literal.
//
//	if err != nil {
//		source := strings.NewReader(`line 1.
//	line 2.
//	`)
//		return source
//	}
func Issue4449Sample1() {
}

// This is sample godoc documentation with indented (by one tab) partial Go code, including a raw string literal.
//
//	if err != nil {
//		source := strings.NewReader(`line 1.
//line 2.
//`)
//		return source
//	}
func Issue4449Sample2() {
}

/* Issue4449Sample3 is commented out because otherwise it makes this entire Go package contain an error:

/src/pkg/github.com/shurcooL/play/54/main.go:33:1: expected declaration, found 'IDENT' line (and 1 more errors)

// This is sample godoc documentation with indented (by one tab) partial Go code, including a raw string literal.
//
//	if err != nil {
//		source := strings.NewReader(`line 1.
line 2.
`)
//		return source
//	}
func Issue4449Sample3() {
}

*/
