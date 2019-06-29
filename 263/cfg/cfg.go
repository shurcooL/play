// Copyright 2017 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package cfg holds configuration shared by multiple parts
// of the go command.
package cfg

// These are general "build flags" used by build and other commands.
var (
	BuildV bool = true // -v flag
	BuildX bool = true // -x flag
)
