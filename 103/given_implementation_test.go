package task

import "fmt"

func ExampleNormalIterator() {
	c := collectionᐸDataᐸintᐳᐳ{
		e(1),
		c{
			e(2), e(3), e(4),
		},
		e(5),
		c{
			e(6),
			c{
				e(7),
				c{
					e(8),
				},
			},
		},
		e(9),
	}

	normalIterator := c.Iterator()
	for normalIterator.HasNext() {
		fmt.Println(normalIterator.Next())
	}

	// Output:
	// 1
	// [2 3 4]
	// 5
	// [6 [7 [8]]]
	// 9
}
