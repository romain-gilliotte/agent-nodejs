import {
  Collection,
  ColumnSchema,
  DataSource,
  DataSourceDecorator,
  Page,
  PaginatedFilter,
  Projection,
  RecordData,
  Sort,
} from '@forestadmin/datasource-toolkit';
import * as factories from '@forestadmin/datasource-toolkit/dist/test/__factories__';

import SortEmulationDecorator from '../../../src/decorators/sort-emulate/collection';

describe('SortEmulationDecoratorCollection', () => {
  // State
  let dataSource: DataSource;
  let decoratedDataSource: DataSourceDecorator<SortEmulationDecorator>;

  // Convenience: Direct access to collections before and after decoration
  let books: Collection;
  let persons: Collection;
  let newBooks: SortEmulationDecorator;
  let newPersons: SortEmulationDecorator;

  // Build datasource
  beforeEach(() => {
    const records: RecordData[] = [
      {
        id: 1,
        authorId: 1,
        author: { id: 1, firstName: 'Isaac', lastName: 'Asimov' },
        title: 'Foundation',
      },
      {
        id: 2,
        authorId: 2,
        author: { id: 2, firstName: 'Edward O.', lastName: 'Thorp' },
        title: 'Beat the dealer',
      },
      {
        id: 3,
        authorId: 3,
        author: { id: 3, firstName: 'Roberto', lastName: 'Saviano' },
        title: 'Gomorrah',
      },
    ];

    books = factories.collection.build({
      name: 'books',
      schema: factories.collectionSchema.build({
        fields: {
          id: factories.columnSchema.uuidPrimaryKey().build(),
          authorId: factories.columnSchema.build(),
          author: factories.manyToOneSchema.build({
            foreignCollection: 'persons',
            foreignKey: 'authorId',
          }),
          title: factories.columnSchema.build({ isSortable: false }),
        },
      }),
      list: jest.fn().mockImplementation((_, filter: PaginatedFilter, projection: Projection) => {
        let rows = records.slice();
        if (filter.conditionTree) rows = filter.conditionTree.apply(rows, books, 'Europe/Paris');
        if (filter.sort) rows = filter.sort.apply(rows);
        if (filter.page) rows = filter.page.apply(rows);

        return projection.apply(rows);
      }),
    });

    persons = factories.collection.build({
      name: 'persons',
      schema: factories.collectionSchema.build({
        fields: {
          id: factories.columnSchema.uuidPrimaryKey().build(),
          firstName: factories.columnSchema.build(),
          lastName: factories.columnSchema.build({ isSortable: false }),
        },
      }),
    });

    dataSource = factories.dataSource.buildWithCollections([persons, books]);
  });

  // Build decorator
  beforeEach(() => {
    decoratedDataSource = new DataSourceDecorator(dataSource, SortEmulationDecorator);

    newBooks = decoratedDataSource.getCollection('books');
    newPersons = decoratedDataSource.getCollection('persons');
  });

  test('emulateFieldSorting() should throw if the field does not exists', () => {
    expect(() => newBooks.emulateFieldSorting('__dontExist')).toThrow(
      "Column not found: 'books.__dontExist'",
    );
  });

  test('emulateFieldSorting() should throw if the field is a relation', () => {
    expect(() => newBooks.emulateFieldSorting('author')).toThrow(
      "Unexpected field type: 'books.author' (found 'ManyToOne' expected 'Column')",
    );
  });

  test('emulateFieldSorting() should throw if the field is in a relation', () => {
    expect(() => newBooks.emulateFieldSorting('author:firstName')).toThrow(
      'Cannot replace sort on relation',
    );
  });

  describe('when emulating sort on book.title (no relations)', () => {
    beforeEach(() => {
      newBooks.emulateFieldSorting('title');
    });

    test('schema should be updated', () => {
      const schema = newBooks.schema.fields.title as ColumnSchema;
      expect(schema.isSortable).toBeTruthy();
    });

    test('should work in ascending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'title', ascending: true }) }),
        new Projection('id', 'title'),
      );

      expect(records).toStrictEqual([
        { id: 2, title: 'Beat the dealer' },
        { id: 1, title: 'Foundation' },
        { id: 3, title: 'Gomorrah' },
      ]);
    });

    test('should work in descending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'title', ascending: false }) }),
        new Projection('id', 'title'),
      );

      expect(records).toStrictEqual([
        { id: 3, title: 'Gomorrah' },
        { id: 1, title: 'Foundation' },
        { id: 2, title: 'Beat the dealer' },
      ]);
    });

    test('should work with pagination', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({
          page: new Page(2, 1),
          sort: new Sort({ field: 'title', ascending: false }),
        }),
        new Projection('id', 'title'),
      );

      expect(records).toStrictEqual([{ id: 2, title: 'Beat the dealer' }]);
    });
  });

  describe('when emulating sort on book.author.lastName (relation)', () => {
    beforeEach(() => {
      newPersons.emulateFieldSorting('lastName');
    });

    test('schema should be updated', () => {
      const schema = newPersons.schema.fields.lastName as ColumnSchema;
      expect(schema.isSortable).toBeTruthy();
    });

    test('should work in ascending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'author:lastName', ascending: true }) }),
        new Projection('id', 'title', 'author:lastName'),
      );

      expect(records).toStrictEqual([
        { id: 1, title: 'Foundation', author: { lastName: 'Asimov' } },
        { id: 3, title: 'Gomorrah', author: { lastName: 'Saviano' } },
        { id: 2, title: 'Beat the dealer', author: { lastName: 'Thorp' } },
      ]);
    });

    test('should work in descending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'author:lastName', ascending: false }) }),
        new Projection('id', 'title', 'author:lastName'),
      );

      expect(records).toStrictEqual([
        { id: 2, title: 'Beat the dealer', author: { lastName: 'Thorp' } },
        { id: 3, title: 'Gomorrah', author: { lastName: 'Saviano' } },
        { id: 1, title: 'Foundation', author: { lastName: 'Asimov' } },
      ]);
    });
  });

  describe('when telling that sort(book.title) = sort(book.author.lastName)', () => {
    beforeEach(() => {
      newBooks.replaceFieldSorting(
        'title',
        new Sort({ field: 'author:lastName', ascending: true }),
      );
    });

    test('schema should be updated', () => {
      const schema = newBooks.schema.fields.title as ColumnSchema;
      expect(schema.isSortable).toBeTruthy();
    });

    test('should work in ascending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'title', ascending: true }) }),
        new Projection('id', 'title', 'author:lastName'),
      );

      expect(records).toStrictEqual([
        { id: 1, title: 'Foundation', author: { lastName: 'Asimov' } },
        { id: 3, title: 'Gomorrah', author: { lastName: 'Saviano' } },
        { id: 2, title: 'Beat the dealer', author: { lastName: 'Thorp' } },
      ]);
    });

    test('should work in descending order', async () => {
      const records = await newBooks.list(
        factories.caller.build(),
        new PaginatedFilter({ sort: new Sort({ field: 'title', ascending: false }) }),
        new Projection('id', 'title', 'author:lastName'),
      );

      expect(records).toStrictEqual([
        { id: 2, title: 'Beat the dealer', author: { lastName: 'Thorp' } },
        { id: 3, title: 'Gomorrah', author: { lastName: 'Saviano' } },
        { id: 1, title: 'Foundation', author: { lastName: 'Asimov' } },
      ]);
    });
  });
});
