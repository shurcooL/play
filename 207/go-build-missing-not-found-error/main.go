// Test program for https://golang.org/cl/33158.
package main

import (
	"fmt"
	"go/build"
	"os"
	//doesnotexist "./doesnotexist"
	//goon "github.com/shurcooL/go-goon"
)

func find(importPath string) error {
	wd, err := os.Getwd()
	if err != nil {
		return err
	}

	bpkg, err := build.Import(importPath, wd, build.FindOnly)
	if err != nil {
		return fmt.Errorf("can't find package %q (first check, using relative import path): %v", importPath, err)
	}

	// TODO: Fix (likely) bug in build.Import with FindOnly mode where it doesn't check if dir exists when local import path is used.
	if build.IsLocalImport(importPath) {
		_, err := build.Import(bpkg.ImportPath, "", build.FindOnly)
		if err != nil {
			return fmt.Errorf("can't find package %q (second check, using absolute import path): %v", importPath, err)
		}
	}

	return nil
}

func find2(importPath string) error {
	wd, err := os.Getwd()
	if err != nil {
		return err
	}

	_, err = build.Import(importPath, wd, 0)
	if err != nil {
		return fmt.Errorf("can't find package %q (first check, using relative import path): %v", importPath, err)
	}

	return nil
}

func main() {
	//goon.DumpExpr(doesnotexist.Orly)
	//return

	const importPath = "./doesnotexist"

	fmt.Printf("finding %q import path:\n%v\n", importPath, find2(importPath))

	// Output:
	// finding "./doesnotexist" import path:
	// can't find package "./doesnotexist" (second check, using absolute import path): cannot find package "github.com/shurcooL/play/31/doesnotexist" in any of:
	// 	/usr/local/go/src/github.com/shurcooL/play/31/doesnotexist (from $GOROOT)
	// 	/Users/Dmitri/Dropbox/Work/2013/GoLanding/src/github.com/shurcooL/play/31/doesnotexist (from $GOPATH)
	// 	/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play/31/doesnotexist
}
