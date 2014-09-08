package main

import (
	"fmt"
	"strings"

	"github.com/shurcooL/go-goon"
	"github.com/tealeg/xlsx"
)

func main() {
	const excelFileName = "/Users/Dmitri/Desktop/try.xlsx"

	xlFile, err := xlsx.OpenFile(excelFileName)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(len(xlFile.Sheets))
	sheet := xlFile.Sheets[1]
	goon.DumpExpr(len(sheet.Rows))
	for _, row := range sheet.Rows {
		if len(row.Cells) < 17 {
			continue
		}
		cell := row.Cells[16]

		s := cell.String()
		if ind := strings.Index(s, "."); ind != -1 {
			s = s[:ind]
		}
		if s == "" {
			continue
		}

		fmt.Printf("%s\n", s)
	}

	return

	for _, sheet := range xlFile.Sheets {
		for _, row := range sheet.Rows {
			for _, cell := range row.Cells {
				fmt.Printf("%s\n", cell.String())
			}
		}
	}
}
