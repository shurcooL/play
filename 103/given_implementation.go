package task

// Implementation details of given interfaces (needed for test code to run).

// e implements Data<int> interface for a single element.
type e int

func (_ e) IsCollection() bool                   { return false }
func (_ e) GetCollection() CollectionᐸDataᐸIntᐳᐳ { panic("not collection") }
func (e e) GetElement() int                      { return int(e) }

// c implements Data<int> interface for a collection of Data<int>.
type c collectionᐸDataᐸIntᐳᐳ

func (_ c) IsCollection() bool                   { return true }
func (c c) GetCollection() CollectionᐸDataᐸIntᐳᐳ { return collectionᐸDataᐸIntᐳᐳ(c) }
func (_ c) GetElement() int                      { panic("not element") }

// collectionᐸDataᐸIntᐳᐳ implements Collection<E> where E is Data<int>.
type collectionᐸDataᐸIntᐳᐳ []DataᐸIntᐳ

func (c collectionᐸDataᐸIntᐳᐳ) IsEmpty() bool { return len(c) == 0 }
func (c collectionᐸDataᐸIntᐳᐳ) Iterator() IteratorᐸDataᐸIntᐳᐳ {
	return &collectionIteratorᐸDataᐸIntᐳᐳ{C: c}
}
func (c collectionᐸDataᐸIntᐳᐳ) Size() int { return len(c) }

// collectionIteratorᐸDataᐸIntᐳᐳ implements Iterator<E> where E is Data<int> for Collection<E>.
type collectionIteratorᐸDataᐸIntᐳᐳ struct {
	C     collectionᐸDataᐸIntᐳᐳ // Collection being iterated.
	index int                   // Index of the next element.
}

func (it *collectionIteratorᐸDataᐸIntᐳᐳ) HasNext() bool {
	return it.index < len(it.C)
}

func (it *collectionIteratorᐸDataᐸIntᐳᐳ) Next() DataᐸIntᐳ {
	e := it.C[it.index]
	it.index++
	return e
}
