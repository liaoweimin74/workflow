/**
 * CodeMirror javascript-hint 用占位结构：仅用于属性名补全，无运行含义。
 * 与 FormCreate 中的 $inject、Api 对齐；按函数参数名匹配。
 */

export function createInjectHintStub() {
    return {
        rule: [],
        self: {},
        option: {},
        args: [],
        api: createApiHintStub(),
    };
}

export function createApiHintStub() {
    return {
        config: {},
        options: {},
        index: {},
        siblings: [],
        rule: [],
        form: {},
        parent: {},
        top: {},
        children: [],
        btn: { loading: {}, disabled: {}, show: {} },
        resetBtn: { loading: {}, disabled: {}, show: {} },
        el: {},
        formEl: {},
        wrapEl: {},
        submitBtnProps: {},
        resetBtnProps: {},
        formData: {},
        getValue: {},
        coverValue: {},
        setValue: {},
        removeField: {},
        removeRule: {},
        fields: {},
        append: {},
        prepend: {},
        hidden: {},
        display: {},
        hiddenStatus: {},
        displayStatus: {},
        disabled: {},
        model: {},
        component: {},
        reload: {},
        updateOptions: {},
        onSubmit: {},
        submit: {},
        sync: {},
        refresh: {},
        refreshOptions: {},
        hideForm: {},
        changeStatus: {},
        clearChangeStatus: {},
        setEffect: {},
        clearEffectData: {},
        updateRule: {},
        mergeRule: {},
        mergeRules: {},
        getRule: {},
        findType: {},
        findTypes: {},
        getCurrentFormRule: {},
        getRenderRule: {},
        getRefRule: {},
        getParentRule: {},
        updateValidate: {},
        updateValidates: {},
        refreshValidate: {},
        clearValidateState: {},
        clearSubValidateState: {},
        validate: {},
        validateField: {},
        method: {},
        exec: {},
        trigger: {},
        toJson: {},
        closeModal: {},
        resetFields: {},
        getSubForm: {},
        nextTick: {},
        nextRefresh: {},
        deferSyncValue: {},
        fetch: {},
        setData: {},
        getData: {},
        watchData: {},
        refreshData: {},
        bus: { $emit: {}, $on: {}, $once: {}, $off: {} },
        emit: {},
        on: {},
        once: {},
        off: {},
    };
}

const PARAM_STUB_FACTORIES = {
    $inject: createInjectHintStub,
    api: createApiHintStub,
};

/**
 * @param {string} name 形参名
 * @returns {Record<string, unknown>|Array<unknown>|null}
 */
export function getGlobalStubForParamName(name) {
    if (!name || typeof name !== 'string') {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(PARAM_STUB_FACTORIES, name)) {
        return PARAM_STUB_FACTORIES[name]();
    }
    return null;
}

