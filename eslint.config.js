import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import tsparser from '@typescript-eslint/parser';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tsparser,
            parserOptions: {
                project: './tsconfig.json'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'jsdoc': jsdoc,
            'import': importPlugin
        },
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../*', './*'],
                            message: 'Please use alias import paths (@core, @utils, etc.) instead of relative imports.'
                        }
                    ]
                }
            ],
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: true,
                        FunctionExpression: true
                    },
                    contexts: [
                        'ExpressionStatement > CallExpression[callee.name=/^it$|^describe$|^test$|^before|^beforeEach|^after|^afterEach/]'
                    ]
                }
            ],
            'jsdoc/check-alignment': 'error',
            'jsdoc/check-indentation': 'error',
            'jsdoc/require-description-complete-sentence': 'error',
            'import/order': [
                'error',
                {
                    groups: [
                        'builtin',
                        'external',
                        'internal',
                        'parent',
                        'sibling',
                        'index',
                        'object',
                        'type'
                    ],
                    pathGroups: [
                        {
                            pattern: '@/**',
                            group: 'internal',
                            position: 'before'
                        },
                        {
                            pattern: '@*',
                            group: 'internal',
                            position: 'before'
                        }
                    ],
                    'newlines-between': 'always',
                    alphabetize: {
                        order: 'asc',
                        caseInsensitive: true
                    }
                }
            ]
        },
        settings: {
            'import/resolver': {
                node: {
                    extensions: ['.js', '.jsx', '.ts', '.tsx']
                },
                typescript: {}
            }
        }
    }
];