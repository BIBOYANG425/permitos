"""THROWAWAY spike function — confirms AIQ register/run + sequential string chaining.

Delete once Task 9 architecture is locked in.
"""

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig


class EchoConfig(FunctionBaseConfig, name="spike_echo"):  # `name` == the `_type` used in YAML
    prefix: str = "echo:"


@register_function(config_type=EchoConfig)
async def spike_echo(config: EchoConfig, builder: Builder):
    async def _call(input_message: str) -> str:
        return f"{config.prefix} {input_message}"

    yield FunctionInfo.from_fn(_call, description="Echo the input with a prefix.")
